Prisma schema ↔ business objects sync algorithm
===============================================

1. Choosing the default action
------------------------------

The sync uses a multi-step algorithm to determine the default action for every Prisma model.

Step 1: check the mapping (repeated syncs)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If the Prisma model already has an entry in ``.sync-mapping.json``:

- the **action from the mapping** is used as the default action;
- the business object is looked up by ``businessObjectId`` from the mapping;
- if the object is found and the mapped action is ``skip``, the status is ``matched``;
- if the object is found and the mapped action is not ``skip``, the status is ``needs_matching``.

Step 2: look for an existing business object
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If there is no mapping entry or no object with that ``businessObjectId``, the object is searched in this
order:

1. **Exact name match** — a business object whose ``name.toLowerCase()`` equals the Prisma model name;
2. **Normalised name** — "model" prefixes/suffixes are removed from the name and the search is repeated;
3. **By id** — a business object whose ``id.toLowerCase()`` equals the Prisma model name.

Step 3: action for a found object
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If the object is found:

- the **structure hash** of the Prisma model is computed (name, fields with types and optionality,
  table name);
- the **structure hash** of the business object is computed (id, fields with types, tables);
- hashes **differ** → action ``update`` (status ``needs_matching``);
- hashes **match** → action ``skip`` (status ``matched``).

Step 4: new object
~~~~~~~~~~~~~~~~~~

If no object is found: action ``create`` (status ``new``).

Step 5: deleted objects
~~~~~~~~~~~~~~~~~~~~~~~

After all Prisma models are processed, business objects are collected that are:

- active (``active !== false``);
- not matched with any Prisma model;
- **synced before** (there is a mapping entry whose ``businessObjectId`` equals the object ``id``).

For these objects the action is ``delete`` (status ``delete``).

----

2. Sync actions
---------------

``create``
~~~~~~~~~~

**When:** the Prisma model exists in the schema and there is no matching business object.

**What happens:**

1. a new business object is created from the structure of the Prisma model;
2. a unique business object id is generated (``model.name`` → ``model.name``);
3. name, description, fields and tables are filled in;
4. the object is saved to the file system;
5. a mapping entry is added: ``{ modelName → { businessObjectId, action: 'create', lastSync } }``.

**Result:** a new business object is ready to use.

----

``update``
~~~~~~~~~~

**When:** the Prisma model exists, the matching business object exists and the model structure has
changed (hashes differ).

**What happens:**

1. the business object is updated from the Prisma model:

   - fields are updated (new ones added, existing ones changed);
   - tables are updated (name, columns);
   - user data (owner, lifecycle) is kept if it was edited manually;

2. the object is saved back to the file system;
3. the mapping entry is updated: ``action: 'update', lastSync``.

**Result:** the business object matches the current Prisma schema; user metadata (owner, lifecycle) is
kept unless it changed in the Prisma model.

**Change details:** the sync reports the concrete changes:

- fields added;
- fields removed;
- field types changed;
- table name changed.

----

``skip``
~~~~~~~~

**When:** the Prisma model exists, the matching business object exists and the structure has **not**
changed (hashes match).

**What happens:**

1. the business object is **not changed**;
2. only ``lastSync`` (timestamp of the last sync) is updated in the mapping;
3. the action is stored as ``skip``.

**Result:** the business object stays as is; the sync record shows that it was checked.

----

``delete``
~~~~~~~~~~

**When:** the Prisma model was **removed from the schema** and the business object was synced from
Prisma before (there is a mapping entry).

**What happens:**

1. the business object is **not physically deleted**;
2. the flag ``active: false`` is set (the object becomes inactive);
3. the object is saved with the updated flag;
4. the mapping entry is removed.

**Result:**

- the business object is inactive (``active: false``) and no longer listed among active objects;
- the link between the Prisma model and the business object is removed from the mapping;
- the data is kept for a possible restore.

**Important:** deletion is **not physical** — the object file stays on disk and can be restored by
setting ``active: true``.

----

Additional information
----------------------

Mapping file (``.sync-mapping.json``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The mapping is stored in ``.sync-mapping.json`` in the business objects folder:

.. code-block:: json

   {
     "User": {
       "businessObjectId": "user",
       "action": "skip",
       "lastSync": 1234567890
     },
     "Product": {
       "businessObjectId": "product",
       "action": "update",
       "lastSync": 1234567891
     }
   }

The mapping is used to:

- keep the link between Prisma models and business objects;
- determine default actions on repeated syncs;
- track objects that were synced from Prisma.

Change detection
~~~~~~~~~~~~~~~~

Changes are detected with a SHA-256 hash of the structure:

- **Prisma model hash**: name + fields (name, type, optionality) + table name;
- **business object hash**: id + fields (name, type) + tables (names).

Different hashes mean the structure changed and an update is needed.

Match statuses
~~~~~~~~~~~~~~

The sync table shows these statuses:

- ``new`` — a new object to create; corresponds to ``create``;
- ``matched`` — the object was found and did not change; corresponds to ``skip``;
- ``needs_matching`` — the object was found but changes must be checked or applied; usually ``update``;
- ``delete`` — the object should be deleted (marked inactive); corresponds to ``delete``.

**Status and action are different things:**

- the **status** shows the current state of the match (shown in the table);
- the **action** is what the sync will do (can be changed in the drop-down).
