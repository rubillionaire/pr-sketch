const fsp = require('fs/promises')
const fetch = require('node-fetch')
const tilebelt = require('@mapbox/tilebelt')
const path = require('path')
const getPixels = require('get-pixels')
const terrainImgToMesh = require('./terrain-img-to-mesh.js')

const directory = process.argv[2]
const prBbox = [-67.302737, 17.823223, -65.119731, 18.553834]
const bbox = prBbox
const zoom = 8
const sampleRate = 32

;(async () => {
  const mapboxKey = (await fsp.readFile('mapbox.key')).toString().trim()

  // [west, south, east, north]
  
  const prRootTile = tilebelt.bboxToTile(bbox)

  const tileSet = getChildrenAtZoom([prRootTile], zoom)

  const tileImgFetch = tileSet.map((tile) => {
    return new Promise(async (resolve, reject) => {
      const imgFilePath = path.join(directory, `${tileFolderOrder(tile).join('-')}.pngraw`)
      try {
        const elevationResponse = await fetchTile({ tile, mapboxKey })  
        await fsp.writeFile(imgFilePath, elevationResponse.body)
      }
      catch (error) {
        return reject(error)
      }
      resolve({ imgFilePath, tile })
    }) 
  })

  const tileImgToMesh = ({ imgFilePath, tile}) => {
    return new Promise(async (resolve, reject) => {
      const geojson = tilebelt.tileToGeoJSON(tile)
      const bounds = geojson.coordinates[0] // [nw, sw, se, ne, nw]
      // bbox for box intersections
      // [w,s,e,n]
      const bbox = [bounds[0][0], bounds[1][1], bounds[2][0], bounds[0][1]]

      getPixels(imgFilePath, 'image/png', async (error, pixels) => {
        if (error) return reject(error)
        const mesh = terrainImgToMesh({ sampleRate, pixels, bbox })
        const meshFilePath = `${imgFilePath.split('.')[0]}.s${sampleRate}.json`
        try {
          await fsp.writeFile(meshFilePath, JSON.stringify(mesh))
        }
        catch (error) {
          return reject(error)
        }
        resolve({ meshFilePath, imgFilePath, tile })
      })
    })
  }

  try {
    const tileImgFiles = await Promise.all(tileImgFetch)
    const meshTileFiles = await Promise.all(tileImgFiles.map(tileImgToMesh))
  }
  catch (error) {
    console.log(error)
  }
})()

function fetchTile ({ tile, mapboxKey }) {
  const domain = 'https://api.mapbox.com/v4/'
  const source = `mapbox.terrain-rgb/${tileFolderOrder(tile).join('/')}.pngraw`;
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
