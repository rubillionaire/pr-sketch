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

const getMap = getProp('map')
const getDrawCmds = getProp('drawCmds')
const setLightPosictionTick = setProp('updateLightPositionForTick')
const getGloblalContext = getProp('globalContext')
const mapSpecs = [
  {
    name: 'nightMap',
    drawProps: {},
  },
]

for (const { name, drawProps } of mapSpecs) {
  const { map } = createMap({ mix, name })
  const drawOpts = createDraws(Object.assign({ map }, drawProps))
  maps.push(Object.assign({ map, name }, drawOpts))
}

function mapScroll2 (state, emit) {
  return html`<body class=${prefix}>
    ${mix.render()}
    <main class="stack">
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

  state.nightMap = Object.assign(tickPositions.midnight, {
    selectedCity: null
  })
  setLightPosictionTick('nightMap', state.rowTriptychNight)

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
  })

  emitter.on('draws-ready', () => {
    frame()

    setHighlight(highlightAllCities, { tick: mix._rcom._mregl.subcontexts[0].tick })
    const nightMapCycle = trackProgress('night-map', (t, bbox) => {
      if (bbox.section.top < 10 && ((Math.abs(bbox.section.top) + bbox.map.height) < bbox.section.height)) {
        const index = Math.floor(t * cities.length)
        setHighlight([index], { tick: mix._rcom._mregl.subcontexts[0].tick })
        state.nightMap.selectedCity = Object.assign({ index }, cities[index])  
      }
      else {
        setHighlight(highlightAllCities, { tick: mix._rcom._mregl.subcontexts[0].tick })
        state.nightMap.selectedCity = null
      }
      emitter.emit('render')
    })

    window.addEventListener('scroll', () => {
      nightMapCycle.scroll()
    })

    window.addEventListener('click', (event) => {
      getMap('nightMap').pick(event, (err, picked) => {
        if (err || picked[3] < 1) {
          state.nightMap.selectedCity = null
        }
        else {
          const index = pickUnpack(picked)
          const feature = cities[index]
          state.nightMap.selectedCity = feature
        }
        console.log(state.nightMap)
        emitter.emit('render')
      })
    })
  })

  function frame () {
    mix.draw()
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