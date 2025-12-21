import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { DCACard } from '@/components/dca/DCACard';
import { CreateDCAModal, DCAFormData } from '@/components/dca/CreateDCAModal';
import { mockDCAPlans, DCAplan } from '@/data/mockPortfolio';
import { Button } from '@/components/ui/button';

const DCAPlans = () => {
  const [plans, setPlans] = useState<DCAplan[]>(mockDCAPlans);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DCAplan | null>(null);

  const activePlans = plans.filter(p => p.isActive);
  const pausedPlans = plans.filter(p => !p.isActive);

  const handleToggle = (id: string) => {
    setPlans(plans.map(plan => 
      plan.id === id ? { ...plan, isActive: !plan.isActive } : plan
    ));
  };

  const handleDelete = (id: string) => {
    setPlans(plans.filter(plan => plan.id !== id));
  };

  const handleEdit = (plan: DCAplan) => {
    setEditingPlan(plan);
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingPlan(null);
  };

  const handleConfirm = (newPlan: DCAFormData) => {
    const mockAsset = { btc: { symbol: 'BTC', name: 'Bitcoin', icon: '₿' }, eth: { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' }, sol: { symbol: 'SOL', name: 'Solana', icon: '◎' } };
    const assetInfo = mockAsset[newPlan.assetId as keyof typeof mockAsset] || { symbol: newPlan.assetId.toUpperCase(), name: newPlan.assetId, icon: '₿' };
    
    if (editingPlan) {
      // Update existing plan
      setPlans(plans.map(plan => 
        plan.id === editingPlan.id 
          ? {
              ...plan,
              assetId: newPlan.assetId,
              symbol: assetInfo.symbol,
              name: assetInfo.name,
              icon: assetInfo.icon,
              amount: newPlan.amount,
              frequency: newPlan.frequency as DCAplan['frequency'],
              customDaysInterval: newPlan.customDaysInterval,
              executionTime: newPlan.executionTime,
              timezone: newPlan.timezone,
              specificDays: newPlan.specificDays,
              slippage: newPlan.slippage,
            }
          : plan
      ));
    } else {
      // Create new plan
      const mockNew: DCAplan = {
        id: `dca_${Date.now()}`,
        assetId: newPlan.assetId,
        symbol: assetInfo.symbol,
        name: assetInfo.name,
        icon: assetInfo.icon,
        amount: newPlan.amount,
        frequency: newPlan.frequency as DCAplan['frequency'],
        nextExecution: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        totalInvested: 0,
        isActive: true,
        createdAt: new Date(),
        customDaysInterval: newPlan.customDaysInterval,
        executionTime: newPlan.executionTime,
        timezone: newPlan.timezone,
        specificDays: newPlan.specificDays,
        slippage: newPlan.slippage,
      };
      setPlans([...plans, mockNew]);
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

        {/* Summary Card */}
        <div className="p-4 rounded-xl glass">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Monthly investment</p>
              <p className="text-2xl font-bold font-display text-foreground">
                ${totalMonthlyInvestment.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Active plans</p>
              <p className="text-2xl font-bold text-primary">{activePlans.length}</p>
            </div>
          </div>
        </div>

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
