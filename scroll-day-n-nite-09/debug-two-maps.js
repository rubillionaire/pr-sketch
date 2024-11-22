// scroll-day-n-nite
// - fork of radiating-coastline-16
// - build note, uses `glsl-georender-style-texture`  @ 4.0.2
// - 00
// - intial choo setup for the scroll
// - 01 adds tryptich using MapFillParent component for display that responds to css parent changes
// - 02
// - refactor the maps to be created based on name, so we can more easily
//    manage dealing with all maps as a group, and then individually as
//    necessary
// - 03
// - add a row triptych
// - working on content
// - 04
// - more content refinement
// - nightMap click to see name of city and population
// - 05
// - try a scrolling interface for the city nights

var app = require('choo')()
var html = require('choo/html')
const mixmap = require('@rubenrodriguez/mixmap')
const { pickUnpack } = require('@rubenrodriguez/mixmap-georender')
const fs = require('fs')
const regl = require('regl')
const css = require('sheetify')
const { createMap, createProps, createDraws, spreadProps } = require('./map-single-draw')
const MapFillParent = require('./map-fill-parent')
const SelectedCity = require('./selected-city')
const lerp = require('../util/lerp')

const prefix = css('./style.css')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

// for triptych
const staticRadiatingCoastlineOpts = {
  tick: 0,
}
const smallRadiatingCoastlineOpts = {
  displayThreshold: 0.22,
}
const maps = []
const getName = (name) => maps.find(m => m.name === name)
const getProp = (prop) => (name) => getName(name)[prop]
const setProp = (prop) => (name, state) => getName(name)[prop](state)
const getTick = (name) => {
  const i = maps.findIndex(m => m.name === name)
  return () => mix._rcom._mregl.subcontexts[i].tick
}

const getMap = getProp('map')
const getDrawCmds = getProp('drawCmds')
const setLightPosictionTick = setProp('updateLightPositionForTick')
const getGloblalContext = getProp('globalContext')
const mapSpecs = [
  {
    name: 'rowTriptychDay',
    mapProps: {},
    drawProps: { radiatingCoastlineOpts: staticRadiatingCoastlineOpts },
  },
  {
    name: 'cerroDePunta',
    mapProps: {
      viewbox: {
        center: [-66.591839, 18.172458],
        aspect: 1,
        xRadius: 0.1,
      },
    },
    drawProps: {},
  },
]

for (const { name, mapProps, drawProps } of mapSpecs) {
  if (mapProps.viewbox && !Array.isArray(mapProps.viewbox)) {
    const vb = mapProps.viewbox
    if (vb.center && vb.aspect === 1 && vb.xRadius) {
      mapProps.viewbox = [
        vb.center[0] - vb.xRadius,
        vb.center[1] - vb.xRadius,
        vb.center[0] + vb.xRadius,
        vb.center[1] + vb.xRadius,
      ]
    }
  }
  const { map } = createMap(Object.assign({ mix, name }, mapProps))
  const drawOpts = createDraws(Object.assign({ map }, drawProps))
  map.id = name
  maps.push(Object.assign({ map, name }, drawOpts))
}

function mapScroll2 (state, emit) {
  return html`<body class=${prefix}>
    ${mix.render()}
    <main class="stack">
      <section id="row-triptych" class="box-border full-width px-4 py-16 bg-light">
        <div class="row-triptych-grid gap-4">
          <div class="aspect-1 overflow-hidden">
            ${state.cache(MapFillParent, 'cerroDePunta').render({
                map: getMap('cerroDePunta'),
                props: {
                  width: 0,
                  height: 0,
                  mouse: false,
                  attributes: {
                    class: 'map',
                  },
                }
              })}
          </div>
          <div class="triptychDay aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'rowTriptychDay').render({
                map: getMap('rowTriptychDay'),
                props: {
                  width: 0,
                  height: 0,
                  mouse: false,
                  attributes: {
                    class: 'map',
                  },
                }
              })}
          </div>
        </div>
      </section>
    </main>
  </body>`
}
async function mapScroll2Store (state, emitter) {
  let cities
  let setHighlight
  let highlightAllCities = []

  createProps({ map: maps[0].map }).then(({ props, cityJson }) => {
    cities = cityJson
    for (let i = 0; i < cities.length; i++) {
      let city = cities[i]
      city.populationFormatted = new Intl.NumberFormat().format(city.population)
      city.rank = i + 1;
      
      if (city.rank === 1) city.rankFormatted = '1st'
      else if (city.rank === 2) city.rankFormatted = '2nd'
      else if (city.rank === 3) city.rankFormatted = '3rd'
      else city.rankFormatted = `${city.rank}th`
    }
    setHighlight = props.city.setHighlight
    highlightAllCities = new Array(cities.length).fill().map((_, i) => i)
    for (const { name } of mapSpecs) {
      const map = getMap(name)
      const draw = getDrawCmds(name)
      spreadProps({ map, draw, props })
    }
    emitter.emit('draws-ready')
  })

  const fadeInRange = [1350, 1420]
  state.mapCycle = {
    tick: 0,
    playing: true
  }
  state.mapFadingIn = {
    tick: fadeInRange[0],
    tickRange: fadeInRange,
  }

  const tickPositions = {
    earlymorning: { tick: 1415 },
    noon: { tick: 1600 },
    afternoon: { tick: 1700 },
    lateafternoon: { tick: 1729 },
    midnight:  { tick: 1100 },
  }

  state.cascadingTriptychDay = tickPositions.earlymorning
  state.cascadingTriptychTransition = tickPositions.noon
  state.cascadingTriptychNight = tickPositions.lateafternoon

  state.rowTriptychDay = tickPositions.noon
  state.rowTriptychTransition = tickPositions.lateafternoon
  state.rowTriptychNight = tickPositions.midnight
  setLightPosictionTick('rowTriptychDay', state.rowTriptychDay)

  setLightPosictionTick('cerroDePunta', tickPositions.noon)

  state.nightMap = Object.assign(tickPositions.midnight, {
    selectedCity: null
  })

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
  })

  emitter.on('draws-ready', () => {
    let nightMapTick = getTick('nightMap')

    frame()

    window.addEventListener('scroll', () => {
    })
  })

  function frame () {
    for (const { map, name } of maps) {
      console.log(name, map.viewbox, map._draw.length)
      map.draw()
    }
    state.mapCycle.tick += 1

    const cerroMap = getMap('cerroDePunta')
    const dayMap = getMap('rowTriptychDay')
    const cerroDraws = getDrawCmds('cerroDePunta')
    const dayDraws = getDrawCmds('rowTriptychDay')

    /*
    
    how is it that the viewbox prop for these 

    - cerroDraws.terrainImgTile
    - dayDraws.terrainImgTile

    is the same? the viewbox should be completely specific to
    each map instance, and draws should only get props from
    their map context, so not sure how this is bleeding between

     */

    setTimeout(() => {
      console.log('delayed')
      console.log('cerroMap.viewbox')
      console.log(cerroMap.viewbox)
      console.log('dayMap.viewbox')
      console.log(dayMap.viewbox)
      console.log(cerroDraws.terrainImgTile.props.length, dayDraws.terrainImgTile.props.length)
      console.log('cerroMap._draw[0].props[0].viewbox')
      console.log(cerroMap._draw[0].props[0].viewbox)
      console.log('dayMap._draw[0].props[0].viewbox')
      console.log(dayMap._draw[0].props[0].viewbox)
      // console.log('cerroDraws.terrainImgTile.props[0].viewbox')
      // console.log(cerroDraws.terrainImgTile.props[0].viewbox)
      // console.log('dayDraws.terrainImgTile.props[4].viewbox')
      // console.log(dayDraws.terrainImgTile.props[4].viewbox)
    }, 3000)

    // if (state.mapCycle.playing) window.requestAnimationFrame(frame)
  }
}

app.route('/', mapScroll2)
app.route('/*', mapScroll2)

app.use(mapScroll2Store)

app.mount('body')

// i want to have functions that listen for scroll and resizing
// scroll:
// 1. get the current scroll top of the map element
// 2. see where that scroll top is in comparision to the max travel distance
// - max travel distance:
// -- section height
// -- section top
function trackProgress (id, onProgress) {
  const sectionEl = document.getElementById(id)
  const mapEl = sectionEl.querySelector('.map')

  const resize = () => {
    
  }

  const scroll = () => {
    const sectionBbox = sectionEl.getBoundingClientRect()
    const mapBbox = mapEl.getBoundingClientRect()
    const maxTravelDistance = sectionBbox.height - mapBbox.height
    const travelDistance = mapBbox.top - sectionBbox.top
    const clampedTravelDistance = Math.max(Math.min(travelDistance, maxTravelDistance), 0.0)
    const travelPercent = clampedTravelDistance/maxTravelDistance
    onProgress(travelPercent, { section: sectionBbox, map: mapBbox })
  }

  return {
    resize,
    scroll,
  }
}