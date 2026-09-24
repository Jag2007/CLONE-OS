import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import CreateVideoPage from "./pages/CreateVideo/CreateVideoPage";
import ViewVideosPage from "./pages/ViewVideos/ViewVideosPage";
import CreateClonePage from "./pages/CreateClone/CreateClonePage";
import GenerationLabPage from "./pages/GenerationLab/GenerationLabPage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminPage from "./pages/Admin/AdminPage";
import { useAuthStore } from "./store/auth.store";

const GENERATION_LAB_ALLOWED_EMAIL = "demo1@cloneos.com";

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

const GenerationLabRoute = () => {
  const user = useAuthStore((state) => state.user);
  if (user?.email?.toLowerCase() !== GENERATION_LAB_ALLOWED_EMAIL) {
    return <Navigate to="/create-video" replace />;
  }

  return <GenerationLabPage />;
};

const ADMIN_EMAILS_CLIENT = [
  "demo1@cloneos.com",
  "admin@cloneos.com",
  "arnav@cloneos.com",
];

const AdminRoute = () => {
  const user = useAuthStore((state) => state.user);
  const emailLower = user?.email?.toLowerCase();
  const isAdmin =
    user?.role === "admin" ||
    (emailLower && ADMIN_EMAILS_CLIENT.includes(emailLower));

  if (!isAdmin) {
    return <Navigate to="/create-video" replace />;
  }

  return <AdminPage />;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Protected routes inside the persistent AppLayout */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/create-video" replace />} />
            <Route path="create-video" element={<CreateVideoPage />} />
            <Route path="create-video/:projectId" element={<CreateVideoPage />} />
            <Route path="videos" element={<ViewVideosPage />} />
            <Route path="create-clone" element={<CreateClonePage />} />
            <Route path="generation-lab" element={<GenerationLabRoute />} />
            <Route path="admin" element={<AdminRoute />} />
          </Route>

          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Catch-all fallback for /index.html and any unmatched routes */}
          <Route path="*" element={<Navigate to="/create-video" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
