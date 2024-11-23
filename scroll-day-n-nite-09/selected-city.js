const html = require('choo/html')
const Component = require('choo/component')

module.exports = class SelectedCity extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = state.components[id] = {}
    this.minLength = 0
  }

  calcMinLength () {
    let minLength = 0
    for (const selectedCity of this.local.cities) {
      const s = this.format({ selectedCity })
      if (s.length > minLength) minLength = s.length
    }
    this.minLength = minLength
  }

  load (element) {
    if (this.local.cities) this.calcMinLength()
  }

  unload () {
    
  }

  format ({ selectedCity }) {
    return selectedCity && selectedCity.city
      ? `${selectedCity.city} is the ${selectedCity.rankFormatted} most populated city with a population of ${selectedCity.populationFormatted}.`
      : 'Scroll to highlight each city on the map.'
  }
 
  update ({ selectedCity, cities }) {
    this.element.innerText = this.format({ selectedCity })
    if (cities && cities.length !== this.local.cities?.length) {
      this.local.cities = cities
      this.calcMinLength()
    }
    return false
  }
 
  createElement ({ selectedCity, cities }) {
    if (cities) {
      this.local.cities = cities
    }
    return html`<p class="mt-2">${this.format({ selectedCity })}</p>`
  }
}
