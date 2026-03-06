import { BrowserRouter, Routes, Route } from 'react-router-dom'
import EventList from './pages/EventList'
import EventDetail from './pages/EventDetail'
import CategoryDetail from './pages/CategoryDetail'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EventList />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/events/:eventId/categories/:categoryId" element={<CategoryDetail />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
