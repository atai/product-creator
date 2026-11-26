Releases, signing and notarization
==================================

Product Creator reuses the signing and notarization setup that already works in Consolieri
(``atai/consolieri-desktop``): electron-builder with hardened runtime and the same entitlements,
electron-builder's built-in notarization (``notarytool``) driven by ``APPLE_*`` environment variables,
the Developer ID certificate passed as a base64 ``.p12`` in ``CSC_LINK`` and a tag-triggered
**Release** workflow that uploads the installers to a GitHub Release
(`PRODUCTCREATOR-21 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-21>`_).

Files
-----

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - File
     - Purpose
   * - ``apps/desktop/electron-builder.yml``
     - Targets, hardened runtime, entitlements, ``notarize: true``, ``publish`` (GitHub) for the
       auto-update feeds, files excluded from the package
   * - ``apps/desktop/resources/entitlements.mac.plist``
     - Hardened runtime entitlements (JIT, unsigned executable memory, DYLD env vars), same as Consolieri
   * - ``apps/desktop/resources/icon.*``
     - App icon: ``icon.svg`` source, ``icon.png`` (1024 px), ``icon.icns``, ``icon.ico``
   * - ``apps/desktop/scripts/dist.mjs``
     - ``pnpm desktop:dist`` wrapper: decides between signed and unsigned, notarized or not, and prints
       what is missing
   * - ``apps/desktop/src/main/updater.ts``
     - Auto-update with ``electron-updater`` from GitHub Releases
   * - ``.github/workflows/release.yml``
     - Release on ``v*`` tags: build macOS / Windows / Linux, publish a GitHub Release
   * - ``.github/workflows/ci.yml``
     - Checks and unsigned check builds on every push / pull request

How ``pnpm desktop:dist`` signs
-------------------------------

.. list-table::
   :header-rows: 1
   :widths: 20 40 40

   * - Platform
     - Signed when
     - Otherwise
   * - macOS
     - ``CSC_LINK`` + ``CSC_KEY_PASSWORD`` (Developer ID Application ``.p12``), or a
       *Developer ID Application* identity in the login keychain (local builds; the identity is pinned
       so electron-builder never picks *Apple Development*)
     - unsigned, not notarized (``mac.identity=null``)
   * - macOS notarization
     - ``APPLE_API_KEY`` (path to ``.p8``) + ``APPLE_API_KEY_ID`` + ``APPLE_API_ISSUER``, or
       ``APPLE_ID`` + ``APPLE_APP_SPECIFIC_PASSWORD`` + ``APPLE_TEAM_ID``, or
       ``APPLE_KEYCHAIN_PROFILE`` (a ``notarytool store-credentials`` profile)
     - signed only (``mac.notarize=false``); Gatekeeper warns after a download
   * - Windows
     - never: Windows builds are **unsigned by decision** (no code-signing certificate). ``WIN_CSC_LINK``
       + ``WIN_CSC_KEY_PASSWORD`` would still be honoured if a certificate is ever added
     - unsigned; SmartScreen warns (not counted as missing, ``PC_REQUIRE_SIGNING`` ignores Windows)
   * - Linux
     - not signed (AppImage / tar.gz)
     -

Every fallback is printed as ``[dist] warning: …`` and, in GitHub Actions, as a warning annotation and
a line in the job summary. ``PC_UNSIGNED=1`` forces an unsigned build; ``PC_REQUIRE_SIGNING=1`` turns
the fallbacks into an error.

Local signed build (macOS)
~~~~~~~~~~~~~~~~~~~~~~~~~~

With the *Developer ID Application* certificate in the login keychain
(``security find-identity -v -p codesigning``) ``pnpm desktop:dist`` signs automatically. To notarize
locally, store notarytool credentials once and point the build at the profile:

.. code-block:: bash

   xcrun notarytool store-credentials product-creator \
     --key ~/private_keys/AuthKey_<KEY_ID>.p8 --key-id <KEY_ID> --issuer <ISSUER_ID>
   APPLE_KEYCHAIN_PROFILE=product-creator pnpm desktop:dist

Check the result:

.. code-block:: bash

   APP="apps/desktop/dist/mac-arm64/Product Creator.app"
   codesign --verify --deep --strict --verbose=2 "$APP"
   spctl -a -vvv -t exec "$APP"     # "accepted, source=Notarized Developer ID" once notarized
   xcrun stapler validate "$APP"

Cutting a release
-----------------

1. Bump ``version`` in ``apps/desktop/package.json`` (the auto-update feeds use it) and commit to
   ``main``.
2. Tag and push: ``git tag v0.2.0 && git push origin v0.2.0``.
3. The **Release** workflow checks that the tag matches the package version, builds the three platforms,
   verifies the macOS signature (``codesign``, ``spctl``, ``stapler``) and publishes a GitHub Release with
   generated notes. Tags with a suffix (``v0.2.0-beta.1``) become pre-releases.

A release can be re-run for an existing tag with *Run workflow* (input ``tag``).

Release assets:

* macOS: ``product-creator-<v>-mac-arm64.dmg`` (the DMG itself is signed, notarized and stapled by
  ``scripts/dist.mjs`` after electron-builder, which only notarizes the ``.app``), ``.zip`` (what
  auto-update downloads), ``latest-mac.yml``;
* Windows: ``product-creator-<v>-win-x64.exe`` (NSIS), ``.zip``, ``latest.yml`` — unsigned, the release
  notes tell users how to get past SmartScreen;
* Linux: ``.AppImage``, ``.tar.gz``, ``latest-linux.yml``.

Auto-update
-----------

``electron-updater`` checks GitHub Releases of ``atai/product-creator`` once at startup in an installed
build, downloads a newer version in the background and installs it on quit; **File → Check for
Updates…** checks on demand. It is off in development, in the Linux ``.tar.gz`` (only the AppImage can
update itself) and with ``PC_DISABLE_AUTO_UPDATE=1``. macOS installs updates only into a signed app.

GitHub secrets
--------------

Set under **Settings → Secrets and variables → Actions → Secrets** of ``atai/product-creator`` (the same
names and formats as in Consolieri, so the values can be copied from there):

.. list-table::
   :header-rows: 1
   :widths: 30 25 45

   * - Secret
     - Platform
     - Value
   * - ``MAC_CSC_LINK``
     - macOS
     - base64 of the *Developer ID Application* ``.p12`` (``base64 -i cert.p12 | tr -d '\n'``)
   * - ``MAC_CSC_KEY_PASSWORD``
     - macOS
     - ``.p12`` export password
   * - ``APPLE_API_KEY``
     - macOS notarization (preferred)
     - base64 of the App Store Connect ``AuthKey_<KEY_ID>.p8`` (or the raw PEM)
   * - ``APPLE_API_KEY_ID``
     - macOS notarization (preferred)
     - Key ID
   * - ``APPLE_API_ISSUER``
     - macOS notarization (preferred)
     - Issuer ID (UUID)
   * - ``APPLE_ID`` / ``APPLE_APP_SPECIFIC_PASSWORD`` / ``APPLE_TEAM_ID``
     - macOS notarization (alternative)
     - Apple ID, app-specific password, 10-character Team ID; used only when the API key set is
       incomplete

No Windows secrets are needed: Windows builds are published unsigned.

Optional repository **variable** ``PC_REQUIRE_SIGNING=true`` makes the Release workflow fail instead of
publishing unsigned installers. ``GITHUB_TOKEN`` is provided by Actions (``contents: write``).

In a good macOS release log you see ``identityName=Developer ID Application: …``, ``Notarization
strategy: App Store Connect API key``, ``notarization successful`` and
``source=Notarized Developer ID`` from ``spctl``. ``Apple Development: …`` means the wrong certificate
was exported.

Package size
------------

The app bundle is mostly Electron itself (~250 MB of frameworks on macOS). The application part
(``app.asar`` + ``app.asar.unpacked``) was cut from ~97 MB to ~22 MB, the macOS app from 355 MB to
279 MB and the DMG from 153 MB to 125 MB (PRODUCTCREATOR-21):

* Prisma schemas are parsed with ``@prisma/prisma-schema-wasm`` (``get_dmmf``) instead of
  ``@prisma/internals``, which also shipped the query and schema engines;
* only ``typescript/lib/typescript.js`` is packaged (no ``tsserver``, ``tsc``, lib ``.d.ts`` files or
  localized diagnostics): the code parser only calls ``ts.createSourceFile``.

Regenerating the icon
---------------------

``apps/desktop/resources/icon.svg`` is a placeholder until there is a brand asset. Render it to a
1024×1024 ``icon.png`` and run ``pnpm --filter desktop icons:build`` (``png2icons``, as in Consolieri) to
regenerate ``icon.icns`` and ``icon.ico``.
