import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Users,
  Shield,
  CreditCard,
  Crown,
  Search,
  Plus,
  RefreshCw,
  Sparkles,
  Film,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { useToast } from "../../hooks/use-toast";
import {
  fetchAdminUsers,
  fetchAdminStats,
  updateAdminUserCredits,
  updateAdminUserPlan,
  updateAdminUserRole,
} from "../../services/admin.service";
import { springSoft } from "../../motion/springs";

const AdminPage = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Selected user for credits modal
  const [selectedUser, setSelectedUser] = useState(null);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState(500);
  const [creditsMode, setCreditsMode] = useState("add"); // 'add' | 'set'
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminStats(),
      ]);
      if (usersRes.data) setUsers(usersRes.data);
      if (statsRes.data) setStats(statsRes.data);
    } catch (err) {
      toast({
        title: "Failed to load admin data",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTogglePlan = async (user) => {
    const targetPlan = user.plan === "pro" ? "free" : "pro";
    setActionLoading(true);
    try {
      const res = await updateAdminUserPlan(user.id, targetPlan);
      toast({
        title: "Plan updated",
        description: res.message || `Updated plan for ${user.email} to ${targetPlan.toUpperCase()}`,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, plan: targetPlan } : u))
      );
      fetchAdminStats().then((res) => res.data && setStats(res.data));
    } catch (err) {
      toast({
        title: "Update failed",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRole = async (user) => {
    const targetRole = user.role === "admin" ? "user" : "admin";
    setActionLoading(true);
    try {
      const res = await updateAdminUserRole(user.id, targetRole);
      toast({
        title: "Role updated",
        description: res.message || `Updated role for ${user.email} to ${targetRole.toUpperCase()}`,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: targetRole } : u))
      );
    } catch (err) {
      toast({
        title: "Update failed",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCredits = async () => {
    if (!selectedUser || !creditsAmount) return;
    setActionLoading(true);
    try {
      const res = await updateAdminUserCredits(
        selectedUser.id,
        Number(creditsAmount),
        creditsMode
      );
      toast({
        title: "Credits updated",
        description: res.message,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, creditsBalance: res.data.creditsBalance } : u
        )
      );
      setCreditsModalOpen(false);
      setSelectedUser(null);
      fetchAdminStats().then((res) => res.data && setStats(res.data));
    } catch (err) {
      toast({
        title: "Failed to update credits",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Admin Console
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage Clone OS users, grant Pro plan access, adjust credit balances, and monitor system metrics.
          </p>
        </div>
        <Button
          onClick={loadData}
          variant="outline"
          disabled={loading}
          className="gap-2 self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
          className="p-5 rounded-xl bg-card border border-border/60 shadow-sm flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Users
            </p>
            <h3 className="text-2xl font-extrabold text-foreground mt-1">
              {stats ? stats.totalUsers : "-"}
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 text-primary">
            <Users className="w-5 h-5" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springSoft, delay: 0.05 }}
          className="p-5 rounded-xl bg-card border border-border/60 shadow-sm flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pro Members
            </p>
            <h3 className="text-2xl font-extrabold text-amber-400 mt-1 flex items-center gap-1.5">
              {stats ? stats.proUsersCount : "-"}
              <Crown className="w-4 h-4 text-amber-400 inline" />
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
            <Crown className="w-5 h-5" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springSoft, delay: 0.1 }}
          className="p-5 rounded-xl bg-card border border-border/60 shadow-sm flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Credits Issued
            </p>
            <h3 className="text-2xl font-extrabold text-foreground mt-1">
              {stats ? stats.totalCredits?.toLocaleString() : "-"}
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <CreditCard className="w-5 h-5" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springSoft, delay: 0.15 }}
          className="p-5 rounded-xl bg-card border border-border/60 shadow-sm flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Projects
            </p>
            <h3 className="text-2xl font-extrabold text-foreground mt-1">
              {stats ? stats.totalProjects : "-"}
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
            <Film className="w-5 h-5" />
          </div>
        </motion.div>
      </div>

      {/* Users Management Table Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            User Accounts ({filteredUsers.length})
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-background border-border text-xs"
            />
          </div>
        </div>

        <div className="border border-border/60 rounded-xl overflow-hidden bg-card/50 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">User Email</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Credits</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-foreground">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      <div className="flex justify-center items-center gap-2">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Loading accounts...
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No accounts found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium flex items-center gap-2">
                        <span>{user.email}</span>
                        {user.role === "admin" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {user.plan === "pro" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Crown className="w-3 h-3 text-amber-400" />
                            PRO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            Free
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs capitalize text-muted-foreground">
                        {user.role || "user"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-400">
                        {user.creditsBalance?.toLocaleString() || 0}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setSelectedUser(user);
                              setCreditsAmount(500);
                              setCreditsMode("add");
                              setCreditsModalOpen(true);
                            }}
                            disabled={actionLoading}
                            className="h-8 text-xs gap-1 border-border/80 hover:bg-muted"
                          >
                            <Plus className="w-3.5 h-3.5 text-emerald-400" />
                            Credits
                          </Button>
                          <Button
                            size="xs"
                            variant={user.plan === "pro" ? "secondary" : "default"}
                            onClick={() => handleTogglePlan(user)}
                            disabled={actionLoading}
                            className={`h-8 text-xs gap-1 ${
                              user.plan === "pro"
                                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                                : "btn-gradient-primary"
                            }`}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            {user.plan === "pro" ? "Make Free" : "Grant Pro"}
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleToggleRole(user)}
                            disabled={actionLoading}
                            title={user.role === "admin" ? "Demote to User" : "Make Admin"}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Manual Credit Addition Modal */}
      <Dialog open={creditsModalOpen} onOpenChange={setCreditsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust User Credits</DialogTitle>
            <DialogDescription>
              Manually add or set credit balance for account:{" "}
              <strong className="text-foreground">{selectedUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                type="button"
                variant={creditsMode === "add" ? "default" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setCreditsMode("add")}
              >
                Add to Current Balance
              </Button>
              <Button
                type="button"
                variant={creditsMode === "set" ? "default" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setCreditsMode("set")}
              >
                Set Exact Balance
              </Button>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">
                Amount of Credits
              </label>
              <Input
                type="number"
                min="0"
                value={creditsAmount}
                onChange={(e) => setCreditsAmount(e.target.value)}
                placeholder="e.g. 1000"
                className="mt-1 bg-background border-border"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[100, 500, 1000, 5000, 10000].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setCreditsAmount(preset)}
                >
                  +{preset}
                </Button>
              ))}
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              Current balance:{" "}
              <span className="font-bold text-foreground">
                {selectedUser?.creditsBalance || 0}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreditsModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCredits} disabled={actionLoading}>
              {actionLoading ? "Updating..." : "Save Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;

