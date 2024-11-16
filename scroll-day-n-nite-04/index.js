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
const mapSpecs = [
  {
    name: 'cascadingTriptychDay',
    drawProps: { radiatingCoastlineOpts: staticRadiatingCoastlineOpts },
  },
  {
    name: 'cascadingTriptychTransition',
    drawProps: { radiatingCoastlineOpts: staticRadiatingCoastlineOpts },
  },
  {
    name: 'cascadingTriptychNight',
    drawProps: { radiatingCoastlineOpts: staticRadiatingCoastlineOpts },
  },
  {
    name: 'rowTriptychDay',
    drawProps: { radiatingCoastlineOpts: smallRadiatingCoastlineOpts },
  },
  {
    name: 'rowTriptychTransition',
    drawProps: { radiatingCoastlineOpts: smallRadiatingCoastlineOpts },
  },
  {
    name: 'rowTriptychNight',
    drawProps: { radiatingCoastlineOpts: smallRadiatingCoastlineOpts },
  },
  {
    name: 'nightMap',
    drawProps: {},
  },
  {
    name: 'mapCycle',
    drawProps: {},
  },
  {
    name: 'mapFadingIn',
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
      <section id="row-triptych" class="box-border full-width px-4 py-16 bg-light">
        <div class="row-triptych-grid gap-4">
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
          <div class="triptychTransition aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'rowTriptychTransition').render({
                map: getMap('rowTriptychTransition'),
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
            ${state.cache(MapFillParent, 'rowTriptychNight').render({
                map: getMap('rowTriptychNight'),
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
          <div class="triptychTransition aspect-pr overflow-hidden">
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
        <div class="relative full-width">
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
                <p>Press a city to see its name and population.</p>
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
  createProps({ map: maps[0].map }).then(({ props, cityJson }) => {
    cities = cityJson
    for (const { name } of mapSpecs) {
      const map = getMap(name)
      const draw = getDrawCmds(name)
      spreadProps({ map, draw, props })
    }
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
  setLightPosictionTick('mapFadingIn', state.mapFadingIn)

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
  setLightPosictionTick('cascadingTriptychDay', state.cascadingTriptychDay)
  setLightPosictionTick('cascadingTriptychTransition', state.cascadingTriptychTransition)
  setLightPosictionTick('cascadingTriptychNight', state.cascadingTriptychNight)

  state.rowTriptychDay = tickPositions.noon
  state.rowTriptychTransition = tickPositions.lateafternoon
  state.rowTriptychNight = tickPositions.midnight
  setLightPosictionTick('rowTriptychDay', state.rowTriptychDay)
  setLightPosictionTick('rowTriptychTransition', state.rowTriptychTransition)
  setLightPosictionTick('rowTriptychNight', state.rowTriptychNight)

  state.nightMap = Object.assign(tickPositions.midnight, {
    selectedCity: null
  })
  setLightPosictionTick('nightMap', state.rowTriptychNight)

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })

    frame()

    const mapFadingInProgress = trackProgress('map-fading-in', state.mapFadingIn)  
    mapFadingInProgress.scroll()
    window.addEventListener('scroll', () => {
      mapFadingInProgress.scroll()
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
    setLightPosictionTick('mapCycle', state.mapCycle)
    setLightPosictionTick('mapFadingIn', state.mapFadingIn)
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
function trackProgress (id, state) {
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
    const tick = lerp(state.tickRange[0], state.tickRange[1], travelPercent)
    state.tick = tick
  }

  return {
    resize,
    scroll,
  }
}