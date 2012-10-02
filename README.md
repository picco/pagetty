Pagetty

Mongo:

# Delete all items on all channels:
db.channels.update({_id: {$exists: true}}, {$set: {items: []}}, true, true)
db.state.remove()
db.history.remove()