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
