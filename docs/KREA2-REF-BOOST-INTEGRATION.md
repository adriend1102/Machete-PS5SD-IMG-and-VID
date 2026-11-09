# Krea2 ref boost integration

`scripts/build-app.sh` applies the complete `patches/sdcpp/*.patch` series to
the submodule checkout. The series is now rebased onto engine commit
`5414603abee791eb3cab66da00deb8de6f2f5da1`, the existing engine
`krea2-ref-boost` commit. Machete points at the fork URL and this base commit;
the build script then applies the PS5 changes locally. The full ordered series
(the original 28 patches plus `0075-server-retry-current-engine-api.patch`)
was applied to a clean checkout of `5414603`; the resulting tree exactly
matched the engine integration branch tree.

The previous failure was caused by using the wrong base. Machete's patches were
written against pinned upstream `b13a48219d5cdf408edcb93da6cd69b612ed03d3`.
Fork `master` advanced from that pin to
`290148d2e31ca6ef9757d567905776b5f3646db5`; the ref-boost commit
`5414603abee791eb3cab66da00deb8de6f2f5da1` is a direct child of that `master`
commit. `0001-ps5-available-ram.patch` fails against the old pin's successor
context at `src/core/backend_fit.cpp:15`, because the surrounding code changed
since the pinned base. Rebasing only onto the old pin would also omit the engine
fork's intervening `master` changes. The tested base therefore includes both
current fork `master` and `ref_boost`: `5414603`.

The rebase retained Krea2's `ref_boost` implementation and the fork's Vulkan
attention fallback unchanged. CMake/build validation could not run in the
Windows environment used for this integration: CMake and a C++ compiler were
not found, and Git Bash failed to start its `sh.exe` process. See the task
report for exact verification commands and limitations.

## 2026-11-05: back to 7cbb2e2, plus the ComfyUI quantized files and the preset

`c867a60` and `f3cfca5` are reverted (`2ff36b8`, `4179bd5`): the sources are those
of `7cbb2e2`, whose GGUF BigLove Krea2 works on the console with
`--params-backend te=disk`. On top of it, and without touching the GGUF path:

- `patches/sdcpp/0078-loader-comfy-block-quant.patch`: ComfyUI-quantized
  safetensors load with their scales. The format of each layer comes from its
  `<layer>.comfy_quant` tensor or from `__metadata__._quantization_metadata`
  (BigLoveKreaEdit3 int4 and nvfp4 only have the latter, which is why int4 never
  loaded). `convrot_w4a4` (int4), `nvfp4`, `asym_w4a8_int8` -> Q4_K, `w6a8_int8`
  -> Q6_K, `mxfp8` and `float8_e4m3fn`/`e5m2` (fp8mixed) -> Q8_0, decoded as
  comfy_kitchen does (swizzled block scales, NVFP4 global scale, ConvRot's
  Hadamard rotation undone). Checked on one real layer of each BigLoveKreaEdit3
  file against the fp8mixed copy: correlation int4 0.985, nvfp4 0.993, mxfp8
  0.999, fp8mixed 1.000. GGUF and safetensors without ComfyUI quantization do
  not go through this code.
- `patches/sdcpp/0079-server-ref-image-args-merge.patch`: a request's
  `ref_image_args` are added after the model's `--ref-image-args` instead of
  replacing them (request keys win; `preset` only when the request has one).
  The web UI sends `ref_boost=<x>`, which replaced the preset of the model's
  .txt; now the .txt preset (e.g. `preset=krea2_edit`) applies. This engine
  ignores `ref_boost` ("ignoring unknown reference image arg").

8-bit files (int8, mxfp8, fp8mixed: 12-13 GB) do not fit the console's 11.4 GiB
next to the text encoder; they need the diffusion weights off the GPU too.

## 2026-11-05: ref_boost as an attention bias (patch 0080)

Why `c867a60` / `f3cfca5` gave flat single-colour images: the boost row was
handed to the graph with `make_input(sd::Tensor<float>(...))`, a temporary.
Graph inputs are copied from host memory when the graph runs, after
`build_graph` returns, so every block read freed memory as its logit bias
(garbage or NaN in the attention, a flat image at the end). The `pe` input
works because it lives in `pe_cache_`.

`patches/sdcpp/0080-krea2-ref-boost-attn-bias.patch`:

- `ref_boost=<x>` in `--ref-image-args` (model .txt) or in a request's
  `ref_image_args` (web UI). With 0079 the request's value comes after the
  .txt one and the engine keeps the last, so the UI field replaces the .txt
  value; the .txt preset (`preset=krea2_edit`) still applies.
- `x == 1` (or no reference image) builds exactly the 7cbb2e2 graph: no bias,
  no extra nodes.
- Otherwise `log(x)` is added to the attention logits of the target queries
  on the keys of the last reference, in all 28 blocks (comfyui-krea2edit
  `_ref_attn_bias`; here the sequence is `[text | target | refs]`). It is one
  `[L, L]` F16 mask through the existing flash-attention mask path (F32 and
  the manual path when flash attention is off), owned by the Krea2 runner and
  rebuilt only when the layout or the value changes. Size: about 18 MiB at
  512x512 with a 512 reference, about 350 MiB at 1024x1536; above 1 GiB it is
  skipped with a warning.
- The log shows `krea2 reference params: preset ..., ref_boost ...` and
  `krea2 ref_boost=... (logit bias ...): text ..., target ..., refs ... tokens`.
- Checked on the CPU backend against a naive attention with the bias
  (flash F16 mask 2e-3, manual F32 mask 1e-6, boost 1 equals no mask).
  Not run on Vulkan here (no usable Vulkan device in the build machine).

UI: `/models` sends each preset's `ref_boost` (from `# defaults: ref_boost=`
or its `--ref-image-args`) and the Ref Boost field starts from it (else 4
for BigLove Krea2 Edit, else 1).

## 2026-11-06: reference geometry and VLM prompt as in training (patch 0081)

`preset=krea2_edit` now prepares the reference the way comfyui-krea2edit's
default `fit` pixel path does (the geometry the Identity Edit weights merged in
BigLove KreaEdit were trained on):

- The reference is resampled in pixel space (bicubic, antialiased) to the
  target's grid density. Within 8% of the target aspect ratio it is
  center-cropped to it and resized to exactly the output size; otherwise it is
  fitted inside on the /16 grid (after a center crop so the fitted size lands on
  the grid exactly). Before, it kept its own aspect ratio at up to 1 MP, so at
  1024x1536 a phone photo became 864x1152: its tokens no longer lined up with
  the target's (ref token (h, w) sits on target token (h, w) during training),
  which costs likeness, most with small faces.
- Its RoPE positions are stride 1, centered on the target (half-token offsets
  allowed), frame 1.
- The Qwen3-VL prompt no longer puts "Picture 1: " before the image (the
  training template has none).

Keys to override from the .txt `--ref-image-args`: `fit_to_target=false`,
`vlm_picture_labels=true` (previous behaviour), `vlm_size=1024` (the node's
`grounding_px`; its README: higher = stronger likeness, lower = stronger edit).
The log shows `krea2 reference params: ... fit to target yes, VLM picture labels no, VLM size 768-768`
and `krea2 fit reference 0: WxH -> WxH (target WxH)`.

## 2026-11-07: ref_boost and the reference encode without running out of memory (patch 0082)

- The 4th run failing ("Not enough memory on the console for this run"): the
  Qwen-Image VAE encode of a 1024x1536 reference asks for about 10 GB in one
  piece. It fits on a fresh start, not after a request (about 1 GB stays taken
  and the pool is split), and unlike the decode it was never retried tiled.
  The encode now retries with smaller spatial tiles on an allocation failure,
  like decode_first_stage.
- ref_boost's bias with flash attention: every boosted query row has the same
  bias over the keys, so the target queries run through flash attention in
  chunks of 512 rows that share one [L_k, 512] F16 mask (about 12 MiB at
  1024x1536) instead of a full [L, L] mask (311 MiB on the GPU and in the CPU
  heap, which on the PS5 come from the same pool). Text and reference rows run
  without a mask. Without flash attention the full mask is kept.
  Checked on the CPU backend against a naive attention with the bias.

## 2026-11-09: optional edit strength (patch 0083, web UI d278b4d)

Krea2 edits start from pure noise: the reference only guides through attention
(and ref_boost). People keep their identity (the Identity Edit training), but
scenes without one get redrawn even when the prompt asks for a small change.

`edit_strength=<0..1>` in `ref_image_args` (default 1, unchanged): below 1 the
first reference is also the starting image, denoised from that strength as in
img2img, so what the prompt does not ask to change stays. The web UI's
**Edit strength** field (next to Ref Boost, default 1) sends it only below 1.
The log shows `krea2 edit strength 0.60: the reference is also the starting image`
and `edit strength 0.60: starting from reference 0`.

## 2026-11-09: NVFP4 file whose quantization metadata has no tensor prefix (patch 0084)

BigLoveKreaEdit3_nvfp4.safetensors lists its quantized layers in
`_quantization_metadata` as `blocks.0.attn.wq`, while its tensors are
`model.diffusion_model.blocks.0.attn.wq.weight`. The loader did not match them:
the NVFP4 weights were dropped, their block scales loaded as plain tensors, and
Linear aborted (`GGML_ASSERT(scale_nelements == 1 || scale_nelements == out_features)`),
closing the app while loading. A metadata layer whose name has no `.weight`
tensor is now matched with the `model.diffusion_model.`, `diffusion_model.` or
`model.` prefix. Checked on the real headers of the five BigLoveKreaEdit3
files: nvfp4 now 261 block-quantized layers (258 nvfp4 + 3 fp8) and no stray
scales; int4 (256), mxfp8 (261), fp8mixed (261) and int8 (224 int8_tensorwise)
unchanged.
