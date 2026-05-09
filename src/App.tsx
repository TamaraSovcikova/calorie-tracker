import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DiaryPage } from '@/app/diary/DiaryPage';
import { MealsPage } from '@/app/meals/MealsPage';
import { ProgressPage } from '@/app/progress/ProgressPage';
import { SettingsPage } from '@/app/settings/SettingsPage';
import { MealEditor } from '@/features/meals/MealEditor';

export default function App() {
  return (
    <Routes>
      {/* Meal editor routes use a fullscreen layout (no bottom nav). */}
      <Route path="/meals/new" element={<MealEditor mode="create" />} />
      <Route path="/meals/:id/edit" element={<MealEditor mode="edit" />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/diary" replace />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/diary/:date" element={<DiaryPage />} />
        <Route path="/meals" element={<MealsPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Route>
    </Routes>
  );
}
