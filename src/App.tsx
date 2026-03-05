import { BrowserRouter, Routes, Route } from 'react-router-dom'
import EventList from './pages/EventList'
import EventDetail from './pages/EventDetail'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EventList />} />
        <Route path="/events/:id" element={<EventDetail />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
