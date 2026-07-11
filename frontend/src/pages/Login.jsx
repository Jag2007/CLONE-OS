import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/use-toast";
import { useAuthStore } from "../store/auth.store";
import { useLogin } from "../services/auth.service";
import { ThemeToggleButton } from "../components/ThemeToggleButton";
import { StaggerItemIndexed } from "../motion/Stagger";
import {
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  Film,
  Palette,
} from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mutateAsync: doLogin, isPending } = useLogin();
  const { setAuth, setLoading, isLoading } = useAuthStore();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.email || !formData.password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const result = await doLogin(formData);
      setAuth(result.data.token, result.data.user);
      toast({
        title: "Success",
        description: result.message || "Login successful!",
      });
      navigate("/");
    } catch (err) {
      const data = err?.response?.data;
      const status = err?.response?.status;
      const message =
        data?.error ||
        data?.message ||
        (status === 401 ? "Invalid email or password" : null) ||
        (status >= 500
          ? "Something went wrong. Please try again later."
          : null) ||
        "Login failed";
      setError(message);
      toast({
        title: "Login failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left Branding Panel */}
      <div className="auth-branding hidden md:flex">
        <div className="auth-branding-content">
          <StaggerItemIndexed index={0}>
            <h1>Create stunning AI-powered videos</h1>
          </StaggerItemIndexed>
          <StaggerItemIndexed index={1}>
            <p>
              Transform your ideas into professional video content with our
              AI-driven creative platform.
            </p>
          </StaggerItemIndexed>
          <StaggerItemIndexed index={2}>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Sparkles className="w-4 h-4" />
              </div>
              <span>AI-powered script and storyboard generation</span>
            </div>
          </StaggerItemIndexed>
          <StaggerItemIndexed index={3}>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Film className="w-4 h-4" />
              </div>
              <span>Professional video creation in minutes</span>
            </div>
          </StaggerItemIndexed>
          <StaggerItemIndexed index={4}>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Palette className="w-4 h-4" />
              </div>
              <span>Customizable actors and visual styles</span>
            </div>
          </StaggerItemIndexed>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="auth-form-side">
        <div className="auth-form-container">
          <StaggerItemIndexed index={0}>
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="auth-logo !mb-0 min-w-0">
                <img src="/logo.png" alt="DCVerse" />
                <span>DCVerse</span>
              </div>
              <ThemeToggleButton />
            </div>
          </StaggerItemIndexed>

          <StaggerItemIndexed index={1}>
            <h2>Welcome back</h2>
          </StaggerItemIndexed>
          <StaggerItemIndexed index={2}>
            <p className="auth-subtitle">Sign in to your account to continue</p>
          </StaggerItemIndexed>

          <form onSubmit={handleSubmit}>
            <StaggerItemIndexed index={3}>
              <div className="auth-input-group">
                <label htmlFor="email">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none z-10" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="h-11 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg"
                    style={{ paddingLeft: "2.75rem" }}
                    required
                  />
                </div>
              </div>
            </StaggerItemIndexed>

            <StaggerItemIndexed index={4}>
              <div className="auth-input-group">
                <label htmlFor="password">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none z-10" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    className="h-11 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg"
                    style={{ paddingLeft: "2.75rem", paddingRight: "2.75rem" }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </StaggerItemIndexed>

            {error && (
              <div className="text-red-400 text-sm mb-4 px-1">{error}</div>
            )}

            <StaggerItemIndexed index={5}>
              <Button
                type="submit"
                className="w-full h-11 btn-gradient-primary font-semibold transition-colors rounded-lg"
                disabled={isLoading || isPending}
              >
                {isLoading || isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </Button>
            </StaggerItemIndexed>
          </form>

          <StaggerItemIndexed index={6}>
            <div className="auth-footer-link">
              Don't have an account? <Link to="/register">Create one</Link>
            </div>
          </StaggerItemIndexed>

          <StaggerItemIndexed index={7}>
            <div className="auth-info-card">
              <p>
                Welcome back to DCVerse. Continue your creative journey with
                AI-powered tools and manage your projects.
              </p>
            </div>
          </StaggerItemIndexed>
        </div>
      </div>
    </div>
  );
};

export default Login;
