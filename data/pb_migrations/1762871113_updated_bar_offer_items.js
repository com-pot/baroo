/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3741736354")

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "json3100603622",
    "maxSize": 0,
    "name": "variantLabels",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "json1493750748",
    "maxSize": 0,
    "name": "variantVolumes",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3741736354")

  // remove field
  collection.fields.removeById("json3100603622")

  // remove field
  collection.fields.removeById("json1493750748")

  return app.save(collection)
})
