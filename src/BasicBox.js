import {
  toDigitFromUint8Array,
  toTextFromUint8Array
} from './utils.js'

export default class BasicBox {
  constructor(data) {
    this.data = new Uint8Array(data)
    this.originData = data
    this._parseData(this.data)
  }

  _parseData(data) {
    this.size = toDigitFromUint8Array(data.slice(0, 4))
    this.type = toTextFromUint8Array(data.slice(4, 8))
    if (this.size === 1) {
      this.largeSize = toDigitFromUint8Array(data.slice(8, 12))
    }
    if (this.type === 'uuid') {
      // todo
      this.userType = data.slice(
        this.size === 1 ? 12 : 8,
        this.size === 1 ? 12 + 16 : 8 + 16,
      )
    }
  }
}