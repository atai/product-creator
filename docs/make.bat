@ECHO OFF
pushd %~dp0
if "%SPHINXBUILD%" == "" (
	if exist .venv\Scripts\sphinx-build.exe (set SPHINXBUILD=.venv\Scripts\sphinx-build.exe) else (set SPHINXBUILD=sphinx-build)
)
set SOURCEDIR=source
set BUILDDIR=build
if "%1" == "" goto help
%SPHINXBUILD% -M %1 %SOURCEDIR% %BUILDDIR% %SPHINXOPTS% %O%
goto end
:help
%SPHINXBUILD% -M help %SOURCEDIR% %BUILDDIR% %SPHINXOPTS% %O%
:end
popd
