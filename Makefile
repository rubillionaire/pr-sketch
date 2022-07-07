public/terrain-rgb/7-40-57.pngraw:
	mkdir -p public/terrain-rgb
	node fetch-elevation.js public/terrain-rgb

pr.osm.pbf:
	curl https://download.geofabrik.de/north-america/us/puerto-rico-latest.osm.pbf -o pr.osm.pbf

