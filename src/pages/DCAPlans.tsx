import { useState, useMemo } from 'react';
import { Plus, Loader2, BarChart3 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { DCACard } from '@/components/dca/DCACard';
import { DCAPortfolioStats } from '@/components/dca/DCAPortfolioStats';
import { DCAPlanStats } from '@/components/dca/DCAPlanStats';
import { BalanceWarningCard } from '@/components/dca/BalanceWarningCard';
import { CreateDCAModal, DCAFormData } from '@/components/dca/CreateDCAModal';
import { DCAplan } from '@/data/mockPortfolio';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDCAPlans, DBDCAPlan, getAssetInfo } from '@/hooks/useDCAPlans';
import { useDCAStats } from '@/hooks/useDCAStats';
import { useBalanceProjection } from '@/hooks/useBalanceProjection';
import { usePrivyAuth } from '@/context/PrivyAuthContext';

// Convert DB plan to display format
const toDisplayPlan = (dbPlan: DBDCAPlan): DCAplan => {
  const assetInfo = getAssetInfo(dbPlan.asset);
  return {
    id: dbPlan.id,
    assetId: dbPlan.asset,
    symbol: assetInfo.symbol,
    name: assetInfo.name,
    icon: assetInfo.icon,
    amount: dbPlan.amount_usd,
    frequency: dbPlan.frequency as DCAplan['frequency'],
    nextExecution: dbPlan.next_execution_at ? new Date(dbPlan.next_execution_at) : new Date(),
    totalInvested: 0, // Will be calculated from executions
    isActive: dbPlan.is_active,
    createdAt: new Date(dbPlan.created_at),
    customDaysInterval: dbPlan.custom_days_interval || undefined,
    executionTime: dbPlan.execution_time || undefined,
    timezone: dbPlan.timezone || undefined,
    specificDays: dbPlan.specific_days || undefined,
    slippage: dbPlan.slippage,
  };
};

const DCAPlans = () => {
  const { isAuthenticated, isLoading: authLoading, login } = usePrivyAuth();
  const { plans: dbPlans, isLoading, createPlan, updatePlan, togglePlan, deletePlan } = useDCAPlans();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DCAplan | null>(null);
  const [activeTab, setActiveTab] = useState('plans');

  // Prepare plan IDs and asset mapping for stats
  const planIds = useMemo(() => dbPlans.map(p => p.id), [dbPlans]);
  const planAssets = useMemo(() => {
    const map: Record<string, string> = {};
    dbPlans.forEach(p => { map[p.id] = p.asset; });
    return map;
  }, [dbPlans]);

  const { portfolioStats, getPlanStats, isLoading: statsLoading } = useDCAStats(planIds, planAssets);
  const balanceProjection = useBalanceProjection();

  // Convert DB plans to display format
  const plans = dbPlans.map(toDisplayPlan);
  const activePlans = plans.filter(p => p.isActive);
  const pausedPlans = plans.filter(p => !p.isActive);

  const handleToggle = async (id: string) => {
    await togglePlan(id);
  };

  const handleDelete = async (id: string) => {
    await deletePlan(id);
  };

  const handleEdit = (plan: DCAplan) => {
    setEditingPlan(plan);
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingPlan(null);
  };

  const handleConfirm = async (formData: DCAFormData) => {
    if (editingPlan) {
      await updatePlan(editingPlan.id, formData);
    } else {
      await createPlan(formData);
    }
  };

  const totalMonthlyInvestment = activePlans.reduce((total, plan) => {
    let multiplier = 1;
    if (plan.frequency === 'daily') {
      multiplier = 30;
    } else if (plan.frequency === 'weekly') {
      multiplier = 4;
    } else if (plan.frequency === 'biweekly') {
      multiplier = 2;
    } else if (plan.frequency === 'monthly') {
      multiplier = 1;
    } else if (plan.frequency === 'custom' && plan.customDaysInterval) {
      multiplier = 30 / plan.customDaysInterval;
    } else if (plan.frequency === 'calendar' && plan.specificDays) {
      multiplier = plan.specificDays.length * 4; // ~4 weeks per month
    }
    return total + (plan.amount * multiplier);
  }, 0);

  // Show loading state
  if (authLoading || isLoading) {
    return (
      <AppShell>
        <div className="p-4 safe-top flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="p-4 safe-top space-y-6">
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2 text-foreground">Sign in to manage DCA plans</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create automated investment plans that run on your schedule
            </p>
            <Button onClick={login} className="rounded-xl gradient-primary">
              Sign In
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">DCA Plans</h1>
            <p className="text-sm text-muted-foreground">Automate your investments</p>
          </div>
          <Button 
            onClick={() => setShowCreateModal(true)}
            className="rounded-xl gradient-primary"
          >
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>
        </div>

        {/* Tabs for Plans / Stats */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plans">My Plans</TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 className="w-4 h-4 mr-1.5" />
              Stats
            </TabsTrigger>
          </TabsList>

          {/* Plans Tab */}
          <TabsContent value="plans" className="space-y-6 mt-4">
            {/* Balance Warning Card */}
            {activePlans.length > 0 && (
              <BalanceWarningCard
                usdcBalance={balanceProjection.usdcBalance}
                totalMonthlyRequired={balanceProjection.totalMonthlyRequired}
                nextExecutionTotal={balanceProjection.nextExecutionTotal}
                executionsCovered={balanceProjection.executionsCovered}
                weeksCovered={balanceProjection.weeksCovered}
                hasLowBalance={balanceProjection.hasLowBalance}
                hasCriticalBalance={balanceProjection.hasCriticalBalance}
                shortfall={balanceProjection.shortfall}
              />
            )}

            {/* Summary Card */}
            <DCAPortfolioStats 
              stats={portfolioStats}
              monthlyInvestment={totalMonthlyInvestment}
              activePlansCount={activePlans.length}
            />

            {/* Active Plans */}
            {activePlans.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                  Active ({activePlans.length})
                </h3>
                <div className="space-y-3">
                  {activePlans.map((plan) => (
                    <DCACard
                      key={plan.id}
                      plan={plan}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Paused Plans */}
            {pausedPlans.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                  Paused ({pausedPlans.length})
                </h3>
                <div className="space-y-3">
                  {pausedPlans.map((plan) => (
                    <DCACard
                      key={plan.id}
                      plan={plan}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {plans.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2 text-foreground">No DCA plans yet</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Create your first automated investment plan
                </p>
                <Button 
                  onClick={() => setShowCreateModal(true)}
                  className="rounded-xl gradient-primary"
                >
                  Create DCA Plan
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-6 mt-4">
            {/* Portfolio Overview */}
            <DCAPortfolioStats 
              stats={portfolioStats}
              monthlyInvestment={totalMonthlyInvestment}
              activePlansCount={activePlans.length}
            />

            {/* Individual Plan Stats */}
            {plans.length > 0 ? (
              <div>
                <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                  Performance by Asset
                </h3>
                <div className="space-y-3">
                  {plans.map((plan) => {
                    const stats = getPlanStats(plan.id);
                    if (!stats) return null;
                    return <DCAPlanStats key={plan.id} stats={stats} />;
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2 text-foreground">No stats yet</h3>
                <p className="text-sm text-muted-foreground">
                  Create a DCA plan to start tracking your performance
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateDCAModal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
        onConfirm={handleConfirm}
        editingPlan={editingPlan}
      />
    </AppShell>
  );
};

export default DCAPlans;
