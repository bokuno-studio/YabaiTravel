import '@testing-library/jest-dom'

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
