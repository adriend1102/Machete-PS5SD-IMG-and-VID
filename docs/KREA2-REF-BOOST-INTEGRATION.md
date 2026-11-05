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

## 2026-11-05: ref_boost restored on the current pin, and what changed

Commit `7cbb2e2` moved the engine gitlink back from `5414603` (the ref_boost
commit) to fork `master` `290148d`, and `5414603` was never pushed to the fork,
so a clean build of `7cbb2e2` had no ref_boost in the engine. The engine work now
lives in the Machete series instead, on top of `290148d`:

- `patches/sdcpp/0078-krea2-ref-boost.patch`: `RefImageParams::ref_boost`, the
  `ref_boost=<x>` reference image arg, and the bias in every Krea2 block. Same math
  as comfyui-krea2edit `_ref_attn_bias`: `log(ref_boost)` added to the logits of the
  target (noisy image) queries on the keys of the last reference. The `[L, L]` mask
  of `5414603` is gone: rows outside the target band use the normal attention path
  (Flash Attention when on), target rows run manual attention in chunks against one
  shared `[L_k, rows]` bias row (~128 MiB of scores per chunk), so the Vulkan Flash
  Attention mask path is never used. The `krea2_edit` preset now resizes the VAE
  reference to the target size with a center crop, as the node's training-matched
  geometry does. Logs: `krea2 reference params: preset ...` and `krea2 ref_boost=...`.
- `patches/sdcpp/0079-server-ref-image-args-merge.patch`: request `ref_image_args`
  are merged over the server's `--ref-image-args` (request keys win). Before, the
  web UI's `ref_boost=<x>` replaced `preset=krea2_edit` and edits silently ran with
  the model default `krea2_ostris_edit`.
- `patches/sdcpp/0080-loader-comfy-block-quant.patch`: ComfyUI `comfy_quant`
  weights in `mxfp8`, `nvfp4` and `convrot_w4a4` (INT4) load with their scales:
  `src/model_io/block_quant.cpp` decodes them as comfy_kitchen does (swizzled
  E8M0/E4M3 block scales, NVFP4 global scale and pre_quant_scale, ConvRot's
  Hadamard rotation undone) in 8 MB row chunks and stores MXFP8 as Q8_0 and
  NVFP4/INT4 as Q4_K (same size as the file). Before, their scales were dropped
  (raw codes: noise) or the weight was missing (INT4: load failure). Other formats
  (`asym_w4a8_int8`, `w6a8_int8`, unknown) fail to load with the format named.
- `ps5/app/models.cpp` + web UI: a preset's `ref_boost` (`# defaults: ref_boost=3`
  or `ref_boost=` in its `--ref-image-args`) is the Ref Boost field's default; the
  field's value replaces it in each request (it is not added).
- `ps5/app/main.cpp`: Face Studio no longer adds PhotoMaker or a face init image
  to models with their own reference path (`--ref-image-args` / `--llm_vision`).

Verified off-console: the full series 0001-0080 applies to `290148d`; the library
and the server sources compile (Linux, CPU); a CPU test gives the band attention
bit-identical results to the full `[L, L]` mask formulation (boost 0.5, 3, 4,
partial last chunk, GQA 8/2 and 4/1, with and without text tokens); a second test
decodes MXFP8/NVFP4/ConvRot-W4A4 files written with a numpy port of comfy_kitchen's
quantizers exactly (max error 3e-8); the conversion to Q8_0/Q4_K adds 0.6% / ~7%
relative RMS.
Not verified yet: a console run.
