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

## 2026-11-05: ref_boost on the pinned engine, second attempt

`c867a60` was reverted (`2ff36b8`): on the console BigLove Krea2 gave single-colour
images and setting the Ref Boost crashed. It had changed three things at once (the
effective reference preset, the attention path and the loader). This attempt keeps
the behaviour of `7cbb2e2` and only adds:

- `patches/sdcpp/0078-krea2-ref-boost.patch`: `ref_boost=<x>` in `ref_image_args`
  (`RefImageParams::ref_boost`, default 1). With x != 1, every Krea2 block computes
  the normal attention of all tokens exactly as before and then recomputes only the
  target (noisy image) rows with `log(x)` added to the logits of the last
  reference's keys (comfyui-krea2edit `_ref_attn_bias`; the sequence here is
  `[text | target | refs]`). The target rows use plain ops in chunks of 32-256 rows
  (mul_mat, scale, add with a broadcast [L_k] bias row, soft_max, mul_mat): no
  [L, L] mask, no masked Flash Attention, no Flash Attention on query slices. The
  graph grows by about 10 nodes per chunk and block. The reference preset is not
  touched: the web UI's `ref_image_args="ref_boost=<x>"` still selects the model's
  default `krea2_ostris_edit`, as in `7cbb2e2`. Logs: `krea2 reference params:` and
  `krea2 ref_boost=... chunks of ... target rows`.
- `patches/sdcpp/0079-loader-comfy-block-quant.patch`: ComfyUI `comfy_quant`
  weights `mxfp8` (-> Q8_0), `nvfp4`, `convrot_w4a4`, `asym_w4a8_int8` (-> Q4_K)
  and `w6a8_int8` (-> Q6_K) are decoded with their scales as comfy_kitchen does.
  GGUF and plain safetensors files do not go through this code.
- `ps5/app/models.cpp` + `04-form-settings.js`: a preset's `ref_boost`
  (`# defaults: ref_boost=3` or in its `--ref-image-args`) is the Ref Boost field's
  default; the field's value replaces it in each request.

Verified off-console (Linux, CPU backend): the series 0001-0079 applies to
`290148d`; the library compiles; the target-row attention equals full-mask
attention bit for bit (ref_boost 0.5/3/4, GQA 48/12 head_dim 128, partial chunks,
with and without Flash Attention for the other rows); the decoders reproduce a
numpy port of comfy_kitchen exactly. A Vulkan test could not run here (SwiftShader
lacks 16-bit storage). Not verified: the console.
