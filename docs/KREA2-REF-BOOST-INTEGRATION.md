# Krea2 ref boost integration

The `ref_boost` implementation lives in the `adriend1102/stable-diffusion.cpp`
feature branch. Machete currently pins the upstream `leejet/stable-diffusion.cpp`
submodule commit in `.gitmodules` and its gitlink. `scripts/build-app.sh` applies
the complete `patches/sdcpp/*.patch` series to that pinned source tree, while
`scripts/host-server.sh` applies the server patch series to a scratch copy.

Do not change the submodule URL or gitlink until the PS5 patch series has been
rebased onto the engine fork's base. A sequential `git apply --cached --check`
of the current series against `adriend1102/stable-diffusion.cpp` `master`
(`290148d2e31ca6ef9757d567905776b5f3646db5`) stops at
`0001-ps5-available-ram.patch` (`src/core/backend_fit.cpp:15`). Updating only
the gitlink would therefore make the existing build scripts fail before they
reach the ref boost changes.

Integration step after rebasing the patches: set the submodule URL to
`https://github.com/adriend1102/stable-diffusion.cpp.git`, update the gitlink
to the tested `krea2-ref-boost` engine commit, and verify both the full PS5
patch series and the host server build against that exact commit.
