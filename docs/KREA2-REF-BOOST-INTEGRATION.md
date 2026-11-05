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
