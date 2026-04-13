import '@testing-library/jest-dom'

// Mock localStorage for components that use it (e.g. useViewLimit)
// jsdom may provide a broken localStorage, so always override
const localStorageStore: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value },
    removeItem: (key: string) => { delete localStorageStore[key] },
    clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]) },
    get length() { return Object.keys(localStorageStore).length },
    key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
  },
  writable: true,
  configurable: true,
})

// Mock IntersectionObserver for components that use it (e.g. LazyLoadWrapper)
globalThis.IntersectionObserver = class {
  root = null
  rootMargin = ''
  thresholds = []
  _callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this._callback = callback
    // Immediately trigger with isIntersecting=true so lazy content renders in tests
    setTimeout(() => {
      this._callback(
        [{ isIntersecting: true, intersectionRatio: 1 } as unknown as IntersectionObserverEntry],
        this,
      )
    }, 0)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
