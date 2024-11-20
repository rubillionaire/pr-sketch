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
const { createMap, createProps, createDraws, spreadProps } = require('./map')
const MapFillParent = require('./map-fill-parent')
const SelectedCity = require('./selected-city')
const lerp = require('../util/lerp')

const prefix = css('./style.css')

const searchParamsString = window.location.search.slice(1)
const searchParams = new URLSearchParams(searchParamsString)
const colors = searchParams.has('light') && searchParams.has('dark')
  ? {
      light: JSON.parse(searchParams.get('light')).map(n => parseFloat(n)),
      dark: JSON.parse(searchParams.get('dark')).map(n => parseFloat(n)),
    }
  : undefined

let bodyStyle = ''
if (colors) {
  for (const name in colors) {
    const rgb = `rgb(${colors[name].join(', ')})`
    const property = `--color-${name}: ${rgb};`
    bodyStyle += `${property}\n`
  }
}

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const staticRadiatingCoastlineOpts = {
  tick: 0,
}
const smallRadiatingCoastlineOpts = {
  displayThreshold: 0.22,
}
const tickPositions = {
  earlymorning: { tick: 1415 },
  noon: { tick: 1600 },
  afternoon: { tick: 1700 },
  lateafternoon: { tick: 1729 },
  midnight:  { tick: 1100 },
}
const viewboxes = {
  cerroDePunta: {
    center: [-66.591839, 18.172458],
    aspect: 1,
    xRadius: 0.1,
  },
  nightSanJuan: {
     center: [-66.105735, 18.465539],
     aspect: 1,
     xRadius: 0.1, 
  },
  nightFajardo: {
     center: [-65.650529, 18.325787],
     aspect: 1,
     xRadius: 0.1, 
   },
   nightManatí: {
     center: [-66.482922, 18.429664],
     aspect: 1,
     xRadius: 0.1, 
   },
}
const tickRanges = {
  mapFadingIn: [1350, 1420],
}
/*
disableDraws.ocean
disableDraws.coastlineShadow
disableDraws.terrainImgTile
disableDraws.radiatingCoastline
disableDraws.city
 */
const disableDraws = {
  night: {
    disableDraws: {
      coastlineShadow: true,
    },
  },
  day: {
    disableDraws: {
      city: true,
    }
  },
  inlandDay: {
    disableDraws: {
      city: true,
      coastlineShadow:  true,
      ocean: true,
      radiatingCoastline: true,
    }
  },
  inlandNight: {
    disableDraws: {
      coastlineShadow:  true,
      radiatingCoastline: true,
    }
  },
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
const getState = getProp('state')

const mapSpecs = [
  {
    name: 'cerroDePuntaNoon',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.noon,
  },
  {
    name: 'cerroDePuntaEarlyMorning',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.earlymorning,
  },
  {
    name: 'cerroDePuntaLateAfternoon',
    mapProps: {
      viewbox: viewboxes.cerroDePunta,
    },
    drawProps: disableDraws.inlandDay,
    animated: false,
    state: tickPositions.lateafternoon,
  },
  {
    name: 'nightSanJuan',
    mapProps: {
      viewbox: viewboxes.nightSanJuan,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
  },
  {
    name: 'nightFajardo',
    mapProps: {
      viewbox: viewboxes.nightFajardo,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
  },
  {
    name: 'nightManatí',
    mapProps: {
      viewbox: viewboxes.nightManatí,
    },
    drawProps: disableDraws.inlandNight,
    animated: false,
    state: tickPositions.midnight,
  },
  {
    name: 'cascadingTriptychDay',
    mapProps: {},
    drawProps: Object.assign({
      radiatingCoastlineOpts: staticRadiatingCoastlineOpts
    }, disableDraws.day),
    animated: false,
    state: tickPositions.earlymorning,
  },
  {
    name: 'cascadingTriptychTransition',
    mapProps: {},
    drawProps: Object.assign({
      radiatingCoastlineOpts: staticRadiatingCoastlineOpts
    }, disableDraws.day),
    animated: false,
    state: tickPositions.noon,
  },
  {
    name: 'cascadingTriptychNight',
    mapProps: {},
    drawProps: Object.assign({
      radiatingCoastlineOpts: staticRadiatingCoastlineOpts
    }, disableDraws.day),
    animated: false,
    state: tickPositions.lateafternoon
  },
  {
    name: 'nightMap',
    mapProps: {},
    drawProps: Object.assign({
      selectCity: 1.0,
    }, disableDraws.night),
    animated: true,
    state: Object.assign({ selectedCity: null }, tickPositions.midnight),
  },
  {
    name: 'mapCycle',
    mapProps: {},
    drawProps: {},
    animated: true,
    state: {
      playing: true,
      tick: 0,
    }
  },
  {
    name: 'mapFadingIn',
    mapProps: {},
    drawProps: {},
    animated: true,
    state: {
      tick: tickRanges['mapFadingIn'][0],
      tickRange: tickRanges['mapFadingIn'],
    }
  },
]

for (const spec of mapSpecs) {
  const { name, mapProps, drawProps } = spec
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
  const { map } = createMap(Object.assign({ mix, name, colors }, mapProps))
  const drawOpts = createDraws(Object.assign({ map, colors }, drawProps))
  maps.push(Object.assign({ map }, spec, drawOpts))
}

const rowTriptychOrder = new Array(6).fill().map((d, i) => {
  return {
    order: i + 1,
    sortOrder: Math.random()
  }
}).sort((a, b) => {
  if (a.sortOrder < b.sortOrder) return -1
  if (a.sortOrder > b.sortOrder) return 1
  return 0
})

function mapScroll2 (state, emit) {
  return html`<body class=${prefix} style=${bodyStyle}>
    ${mix.render()}
    <main class="stack gap-2">
      <section id="row-triptych" class="box-border full-width p-4 bg-light">
        <div class="row-triptych-grid gap-2">
          <div
            class="aspect-1 overflow-hidden"
            style="--order: ${rowTriptychOrder[0].order}"
            >
            ${state.cache(MapFillParent, 'cerroDePuntaEarlyMorning').render({
                map: getMap('cerroDePuntaEarlyMorning'),
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
          <div
            class="aspect-1 overflow-hidden"
            style="--order: ${rowTriptychOrder[1].order}"
            >
            ${state.cache(MapFillParent, 'cerroDePuntaNoon').render({
                map: getMap('cerroDePuntaNoon'),
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
          <div
            class="aspect-1 overflow-hidden"
            style="--order: ${rowTriptychOrder[2].order}"
            >
            ${state.cache(MapFillParent, 'cerroDePuntaLateAfternoon').render({
                map: getMap('cerroDePuntaLateAfternoon'),
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
          <div
            class="aspect-1 overflow-hidden"
            style="--order: ${rowTriptychOrder[3].order}"
            >
            ${state.cache(MapFillParent, 'nightFajardo').render({
                map: getMap('nightFajardo'),
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
          <div
            class="aspect-1 overflow-hidden"
            style="--order: ${rowTriptychOrder[4].order}"
            >
            ${state.cache(MapFillParent, 'nightSanJuan').render({
                map: getMap('nightSanJuan'),
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
          <div
            class="aspect-1 overflow-hidden"
            style="--order: ${rowTriptychOrder[5].order}"
            >
            ${state.cache(MapFillParent, 'nightManatí').render({
                map: getMap('nightManatí'),
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

      <header class="bg-light">
        <hgroup class="p-8">
          <h1 class="text-dark line-height-1">1-bit Puerto Rico</h1>
          <p class="text-dark">terrain by day, city lights at night<br/>
            a map by <a class="text-dark" href="https://rubenrodriguez.me" target="_blank">rubén rodríguez</a>
          </p>
        </hgroup>
      </header>

      <section class="box-border bg-light full-width p-8">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>
              This 1-bit map of Puerto Rico is an exploration how
              much information can be communicated on a map of
              country scale by just using one color.
            </p>
          </div>
        </div>
      </section>

      <section id="map-fading-in" class="bg-light">
        ${getMap('mapFadingIn').render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>

      <section class="box-border bg-light full-width p-8">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>
              During the day portion of the map's cycle, we see a
              representation of the topography of Puerto Rico. The
              sun travels across the equator casting
              shadows over the central mountain range,
              <a
                href="https://en.wikipedia.org/wiki/Cordillera_Central_(Puerto_Rico)"
                target="_blank"
              >Cordillera Central</a>.
            </p>
          </div>
        </div>
      </section>

      <section id="cascading-triptych" class="box-border full-width p-4 bg-light">
        <div class="cascading-triptych-grid gap-4">
          <div class="triptychDay aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'cascadingTriptychDay').render({
                map: getMap('cascadingTriptychDay'),
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
          <div class="triptychTransition aspect-pr overflow-hidden relative">
            ${state.cache(MapFillParent, 'cascadingTriptychTransition').render({
                map: getMap('cascadingTriptychTransition'),
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
          <div class="triptychNight aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'cascadingTriptychNight').render({
                map: getMap('cascadingTriptychNight'),
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

      <section class="box-border p-8 bg-dark">
        <div id="night-map" class="relative full-width">
          <div class="relative box-border figure-caption gap-4" >
            <figure class="aspect-pr overflow-hidden">
              ${state.cache(MapFillParent, 'nightMap').render({
                  map: getMap('nightMap'),
                  props: {
                    width: 0,
                    height: 0,
                    mouse: false,
                    attributes: {
                      class: 'map',
                    },
                  }
                })}
            </figure>
            <caption>
              <div class="max-width-text text-light text-start">
                <p>
                  While the night cycle of the map showcases the glimmering
                  lights of the twenty most populated cities.
                </p>
                ${state.cache(SelectedCity, 'selected-city').render(state.nightMap)}
              </div>
            </caption>
          </div>
        </div>
      </section>

      <section class="box-border bg-light full-width p-8">
        <div class="stack items-center">
          <div class="max-width-text">
            <p>
              This past year I decided to make more art projects
              to satisfy my curiosity of seeing more web maps that
              resemble video games, and to work on the tools
              to support this endevaour.
            </p>
          </div>
        </div>
      </section>

      <section class="bg-light">
        ${getMap('mapCycle').render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>
    </main>
  </body>`
}
async function mapScroll2Store (state, emitter) {
  let cities
  let setHighlight
  let highlightAllCities = []

  for (const { name } of maps) {
    state[name] = getState(name)
    if (getState(name).hasOwnProperty('tick')) {
      setLightPosictionTick(name, getState(name))
    }
  }

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

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
  })

  emitter.on('draws-ready', () => {
    let nightMapTick = getTick('nightMap')

    frame()

    const mapFadingInProgress = trackProgress('map-fading-in', (t) => {
      const tick = lerp(state.mapFadingIn.tickRange[0], state.mapFadingIn.tickRange[1], t)
      state.mapFadingIn.tick = tick
    })

    setHighlight(highlightAllCities, { tick: nightMapTick() })
    const nightMapCycle = trackProgress('night-map', (t, bbox) => {
      const hasSelected = !!state.nightMap.selectedCity
      if (bbox.section.top < 10 && ((Math.abs(bbox.section.top) + bbox.map.height) < bbox.section.height)) {
        const index = Math.floor(t * cities.length)
        setHighlight([index], { tick: nightMapTick() })
        state.nightMap.selectedCity = Object.assign({ index }, cities[index])  
        emitter.emit('render')
      }
      else if (hasSelected) {
        setHighlight(highlightAllCities, { tick: nightMapTick() })
        state.nightMap.selectedCity = null
        emitter.emit('render')
      }
    })

    mapFadingInProgress.scroll()
    window.addEventListener('scroll', () => {
      mapFadingInProgress.scroll()
      nightMapCycle.scroll()
    })
  })

  function frame () {
    setLightPosictionTick('mapCycle', state.mapCycle)
    setLightPosictionTick('mapFadingIn', state.mapFadingIn)
    // drawing any map will re-draw all of them that are already
    // on screen based on mixmap > regl-component/multi
    maps[0].map.draw()
    state.mapCycle.tick += 1

    if (state.mapCycle.playing) window.requestAnimationFrame(frame)
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