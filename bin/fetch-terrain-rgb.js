const fsp = require('fs/promises')
const fetch = require('node-fetch')
const tilebelt = require('@mapbox/tilebelt')
const path = require('path')

const directory = process.argv[2]
const zoomOrTileSet = process.argv[3] ? getZoomOrTileSet(process.argv[3]) : 8
const resolution = '@2x'

;(async () => {
  const mapboxKey = (await fsp.readFile('mapbox.key')).toString().trim()

  // [west, south, east, north]
  const prBbox = [-67.302737, 17.823223, -65.119731, 18.553834]
  prBbox[3] += 0.8
  const prRootTile = tilebelt.bboxToTile(prBbox)

  let tileSet
  if (Array.isArray(zoomOrTileSet)) {
    tileSet = zoomOrTileSet
  }
  else {
    tileSet = getChildrenAtZoom([prRootTile], 8)
  }

  const tileProcessors = tileSet.map((tile) => {
    return new Promise(async (resolve, reject) => {
      const elevationResponse = await fetchTile({ tile, mapboxKey })
      await fsp.writeFile(path.join(directory, `${tileFolderOrder(tile).join('-')}${resolution}.pngraw`), elevationResponse.body)
    }) 
  })

  try {
    await Promise.all(tileProcessors)
  }
  catch (error) {
    console.log(error)
  }
})()

function fetchTile ({ tile, mapboxKey }) {
  console.log(tile)
  const domain = 'https://api.mapbox.com/v4/'
  const source = `mapbox.terrain-rgb/${tileFolderOrder(tile).join('/')}${resolution}.pngraw`;
  const url = `${domain}${source}?access_token=${mapboxKey}`;
  return fetch(url)
}

function tileFolderOrder (tile) {
  return [tile[2], tile[0], tile[1]]
}

function tileZoom (tile) {
  return tile[2]
}

function getChildrenAtZoom (rootTiles, desiredZoom) {
  if (rootTiles[0][2] === desiredZoom) return rootTiles
  const tileSet = rootTiles.map(tile => tilebelt.getChildren(tile))
    .reduce((acc, curr)=> {acc = acc.concat(curr); return acc;}, [])
  return getChildrenAtZoom(tileSet, desiredZoom)
}

function getZoomOrTileSet (input) {
  if (input.indexOf('-') > -1) {
    // is tileset, assumes {z}-{x}-{y}
    return input.split(',').map((s) => {
      const n = s.split('-').map(Number)
      return [n[1], n[2], n[0]]
    })
  }
  else {
    // is zoom to capture
    return Number(input)
  }
}
