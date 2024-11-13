pr.osm.pbf:
	curl https://download.geofabrik.de/north-america/us/puerto-rico-latest.osm.pbf -o pr.osm.pbf

public/fonts/Fredoka-SemiBold-c--coqui.qbfz:
	npx qbzf public/fonts/Fredoka-SemiBold.ttf -o public/fonts/Fredoka-SemiBold-c--coqui.qbfz -c c,o,q,u,í

public/fonts/Fredoka-SemiBold--tile-labels.qbfz:
	npx qbzf public/fonts/Fredoka-SemiBold.ttf -o public/fonts/Fredoka-SemiBold--tile-labels.qbfz -c 0,1,2,3,4,5,6,7,8,9,-

public/fonts/dejavu-sans.bold--tile-labels.qbfz:
	npx qbzf public/fonts/dejavu-sans.bold.ttf -o public/fonts/dejavu-sans.bold--tile-labels.qbfz -c 0,1,2,3,4,5,6,7,8,9,-

fetch-terrain-rgb-zoom-8:
	mkdir -p public/terrain-rgb
	node bin/fetch-terrain-rgb.js public/terrain-rgb 8-80-114,8-80-115,8-81-114,8-81-115

fetch-terrain-rgb-zoom-9:
	mkdir -p public/terrain-rgb
	node bin/fetch-terrain-rgb.js public/terrain-rgb 9-160-229,9-160-230,9-161-229,9-161-230,9-162-229,9-162-230,9-163-229,9-163-230

fetch-terrain-rgb-zoom-10:
	mkdir -p public/terrain-rgb
	node bin/fetch-terrain-rgb.js public/terrain-rgb 10-320-458,10-320-459,10-320-460,10-321-458,10-321-459,10-321-460,10-322-458,10-322-459,10-322-460,10-323-458,10-323-459,10-323-460,10-324-458,10-324-459,10-324-460,10-325-458,10-325-459,10-325-460,10-326-458,10-326-459,10-326-460

public/terrain-rgb/10-323-459.pngraw:
	mkdir -p public/terrain-rgb
	node bin/fetch-terrain-rgb.js public/terrain-rgb 10-323-459
