# Configuration file for the Sphinx documentation builder.
# https://www.sphinx-doc.org/en/master/usage/configuration.html

import json
import os
from datetime import date

# -- Project information -----------------------------------------------------

project = 'Product Creator'
# Repo created 2022 (GitHub createdAt 2022-01-07); end year is the docs build year
copyright = f'2022-{date.today().year}, Rustam Atai'
author = 'Rustam Atai'

_root_package = os.path.join(os.path.dirname(__file__), '..', '..', 'package.json')
with open(_root_package, encoding='utf-8') as f:
    release = json.load(f).get('version', '0.0.0')
version = release

# -- General configuration ---------------------------------------------------

extensions = [
    'sphinx.ext.todo',
    'sphinx.ext.githubpages',
    'sphinxcontrib.mermaid',
]

templates_path = ['_templates']
exclude_patterns = ['_build', 'build', 'Thumbs.db', '.DS_Store', '.venv']

source_suffix = '.rst'
master_doc = 'index'
language = 'en'

todo_include_todos = True

# -- Options for HTML output -------------------------------------------------

html_theme = 'sphinx_rtd_theme'
html_static_path = ['_static']
html_title = 'Product Creator Documentation'
html_short_title = 'Product Creator'
html_theme_options = {
    'collapse_navigation': False,
    'sticky_navigation': True,
    'navigation_depth': 3,
    'includehidden': True,
    'titles_only': False,
}
html_context = {
    'display_github': True,
    'github_user': 'atai',
    'github_repo': 'product-creator',
    'github_version': 'main',
    'conf_py_path': '/docs/source/',
}
