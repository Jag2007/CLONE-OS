import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import CreateVideoPage from "./pages/CreateVideo/CreateVideoPage";
import ViewVideosPage from "./pages/ViewVideos/ViewVideosPage";
import CreateClonePage from "./pages/CreateClone/CreateClonePage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { useAuthStore } from "./store/auth.store";

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
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
          </Route>

          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
