import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import HomePage from './pages/Home';
import LaboratoryPage from './pages/Laboratory';
import EarnPage from './pages/Earn';
import ProfilePage from './pages/Profile';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="laboratory" element={<LaboratoryPage />} />
        <Route path="earn" element={<EarnPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
