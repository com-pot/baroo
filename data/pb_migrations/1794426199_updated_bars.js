/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2044303067")

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1767278655",
    "max": 3,
    "min": 3,
    "name": "currency",
    "pattern": "&[a-z]{3}$",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2044303067")

  // remove field
  collection.fields.removeById("text1767278655")

  return app.save(collection)
})
