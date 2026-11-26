# Minimal makefile for Sphinx documentation
#
#   make venv   — create docs/.venv with requirements.txt
#   make html   — build HTML into docs/build/html

SPHINXOPTS    ?=
VENV          ?= .venv
SPHINXBUILD   ?= $(if $(wildcard $(VENV)/bin/sphinx-build),$(VENV)/bin/sphinx-build,sphinx-build)
SOURCEDIR     = source
BUILDDIR      = build

help:
	@$(SPHINXBUILD) -M help "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)

venv:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q -r requirements.txt

.PHONY: help venv Makefile

# Catch-all target: route all unknown targets to Sphinx using the new "make mode" option.
%: Makefile
	@$(SPHINXBUILD) -M $@ "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)
