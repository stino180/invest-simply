import { useState, useEffect } from 'react';
import { X, ChevronDown, Check, Loader2, Clock, Calendar, Settings2 } from 'lucide-react';
import { mockAssets, Asset, formatPrice } from '@/data/mockAssets';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DCAplan } from '@/data/mockPortfolio';

export interface DCAFormData {
  assetId: string; 
  amount: number; 
  frequency: string;
  customDaysInterval?: number;
  executionTime: string;
  timezone: string;
  specificDays?: string[];
  slippage: number;
}

interface CreateDCAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (plan: DCAFormData) => void;
  editingPlan?: DCAplan | null;
}

const slippagePresets = [0.1, 0.5, 1.0, 2.0];

const presetFrequencies = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const weekDays = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const presetAmounts = [25, 50, 100, 250];

const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export const CreateDCAModal = ({ isOpen, onClose, onConfirm, editingPlan }: CreateDCAModalProps) => {
  const [selectedAsset, setSelectedAsset] = useState<Asset>(mockAssets[0]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [amount, setAmount] = useState('50');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Schedule state
  const [scheduleType, setScheduleType] = useState<'preset' | 'custom' | 'calendar'>('preset');
  const [frequency, setFrequency] = useState('weekly');
  const [customDays, setCustomDays] = useState('3');
  const [executionTime, setExecutionTime] = useState('09:00');
  const [timezone, setTimezone] = useState(getUserTimezone());
  const [selectedDays, setSelectedDays] = useState<string[]>(['monday']);
  
  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [customSlippage, setCustomSlippage] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const numCustomDays = parseInt(customDays) || 1;
  const numSlippage = parseFloat(slippage) || 0.5;
  
  const isEditing = !!editingPlan;

  // Populate form when editing
  useEffect(() => {
    if (editingPlan) {
      const asset = mockAssets.find(a => a.id === editingPlan.assetId) || mockAssets[0];
      setSelectedAsset(asset);
      setAmount(editingPlan.amount.toString());
      
      if (editingPlan.frequency === 'custom') {
        setScheduleType('custom');
        setCustomDays(editingPlan.customDaysInterval?.toString() || '3');
      } else if (editingPlan.frequency === 'calendar') {
        setScheduleType('calendar');
        setSelectedDays(editingPlan.specificDays || ['monday']);
      } else {
        setScheduleType('preset');
        setFrequency(editingPlan.frequency);
      }
      
      setExecutionTime(editingPlan.executionTime || '09:00');
      setTimezone(editingPlan.timezone || getUserTimezone());
      setSlippage(editingPlan.slippage?.toString() || '0.5');
      
      // Show advanced if custom settings exist
      if (editingPlan.executionTime || (editingPlan.slippage && editingPlan.slippage !== 0.5)) {
        setShowAdvanced(true);
      }
    }
  }, [editingPlan]);

  // Auto-detect timezone on mount (only if not editing)
  useEffect(() => {
    if (!editingPlan) {
      setTimezone(getUserTimezone());
    }
  }, [editingPlan]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const getScheduleSummary = (): string => {
    let frequencyText = '';
    
    if (scheduleType === 'preset') {
      frequencyText = presetFrequencies.find(f => f.value === frequency)?.label.toLowerCase() || frequency;
    } else if (scheduleType === 'custom') {
      frequencyText = `every ${numCustomDays} day${numCustomDays > 1 ? 's' : ''}`;
    } else {
      const days = selectedDays.map(d => weekDays.find(wd => wd.value === d)?.label).join(', ');
      frequencyText = `on ${days || 'selected days'}`;
    }

    return `${frequencyText} at ${executionTime}`;
  };

  const handleConfirm = async () => {
    if (numAmount <= 0) return;
    if (scheduleType === 'calendar' && selectedDays.length === 0) return;
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsProcessing(false);
    setIsSuccess(true);
    
    setTimeout(() => {
      const finalFrequency = scheduleType === 'custom' ? 'custom' : 
                             scheduleType === 'calendar' ? 'calendar' : 
                             frequency;
      
      onConfirm({ 
        assetId: selectedAsset.id, 
        amount: numAmount, 
        frequency: finalFrequency,
        customDaysInterval: scheduleType === 'custom' ? numCustomDays : undefined,
        executionTime,
        timezone,
        specificDays: scheduleType === 'calendar' ? selectedDays : undefined,
        slippage: numSlippage,
      });
      setIsSuccess(false);
      setAmount('50');
      setFrequency('weekly');
      setScheduleType('preset');
      setCustomDays('3');
      setSelectedDays(['monday']);
      setSlippage('0.5');
      setShowAdvanced(false);
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-slide-up shadow-2xl max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {isSuccess ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4 animate-scale-in">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">
              {isEditing ? 'DCA Plan Updated!' : 'DCA Plan Created!'}
            </h3>
            <p className="text-muted-foreground">
              Auto-buying ${numAmount} of {selectedAsset.symbol} {getScheduleSummary()}
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold mb-6 text-foreground">
              {isEditing ? 'Edit DCA Plan' : 'Create DCA Plan'}
            </h3>

            {/* Asset Selector */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                Select Asset
              </label>
              <button
                onClick={() => setShowAssetPicker(!showAssetPicker)}
                className="w-full flex items-center justify-between p-4 bg-secondary rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-lg">
                    {selectedAsset.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-foreground">{selectedAsset.symbol}</div>
                    <div className="text-sm text-muted-foreground">{selectedAsset.name}</div>
                  </div>
                </div>
                <ChevronDown className={cn(
                  'w-5 h-5 text-muted-foreground transition-transform',
                  showAssetPicker && 'rotate-180'
                )} />
              </button>
              
              {showAssetPicker && (
                <div className="mt-2 bg-secondary rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {mockAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setShowAssetPicker(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 hover:bg-card transition-colors',
                        selectedAsset.id === asset.id && 'bg-card'
                      )}
                    >
                      <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
                        {asset.icon}
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-sm text-foreground">{asset.symbol}</div>
                        <div className="text-xs text-muted-foreground">{asset.name}</div>
                      </div>
                      <div className="text-sm font-medium text-foreground">{formatPrice(asset.price)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                Amount per purchase (USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-14 pl-10 pr-4 text-2xl font-bold text-foreground bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  placeholder="0"
                />
              </div>
              
              <div className="flex gap-2 mt-3">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset.toString())}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                      amount === preset.toString()
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                    )}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Type Tabs */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                Schedule Type
              </label>
              <div className="flex bg-secondary rounded-xl p-1 gap-1">
                <button
                  onClick={() => setScheduleType('preset')}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                    scheduleType === 'preset'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-card'
                  )}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Standard
                </button>
                <button
                  onClick={() => setScheduleType('custom')}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                    scheduleType === 'custom'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-card'
                  )}
                >
                  Every X Days
                </button>
                <button
                  onClick={() => setScheduleType('calendar')}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                    scheduleType === 'calendar'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-card'
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Days
                </button>
              </div>
            </div>

            {/* Preset Frequency Selector */}
            {scheduleType === 'preset' && (
              <div className="mb-4">
                <label className="text-sm text-muted-foreground mb-2 block">
                  Frequency
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {presetFrequencies.map((freq) => (
                    <button
                      key={freq.value}
                      onClick={() => setFrequency(freq.value)}
                      className={cn(
                        'py-3 rounded-xl text-sm font-medium transition-all',
                        frequency === freq.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Days Input */}
            {scheduleType === 'custom' && (
              <div className="mb-4">
                <label className="text-sm text-muted-foreground mb-2 block">
                  Every how many days?
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-foreground">Every</span>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-20 text-center text-foreground bg-secondary border-transparent focus:border-primary"
                  />
                  <span className="text-foreground">day{numCustomDays > 1 ? 's' : ''}</span>
                </div>
              </div>
            )}

            {/* Calendar Day Selector */}
            {scheduleType === 'calendar' && (
              <div className="mb-4">
                <label className="text-sm text-muted-foreground mb-2 block">
                  Select days of the week
                </label>
                <div className="flex flex-wrap gap-2">
                  {weekDays.map((day) => (
                    <button
                      key={day.value}
                      onClick={() => toggleDay(day.value)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                        selectedDays.includes(day.value)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                {selectedDays.length === 0 && (
                  <p className="text-xs text-destructive mt-2">Please select at least one day</p>
                )}
              </div>
            )}

            {/* Advanced Toggle */}
            <div className="flex items-center justify-between mb-4 p-3 bg-secondary/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="advanced-mode" className="text-sm font-medium text-foreground cursor-pointer">
                  Advanced Settings
                </Label>
              </div>
              <Switch
                id="advanced-mode"
                checked={showAdvanced}
                onCheckedChange={setShowAdvanced}
              />
            </div>

            {/* Advanced Settings Section */}
            {showAdvanced && (
              <div className="mb-4 space-y-4 p-4 bg-secondary/30 rounded-xl border border-border/50">
                {/* Execution Time */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    Execution Time
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        type="time"
                        value={executionTime}
                        onChange={(e) => setExecutionTime(e.target.value)}
                        className="text-foreground bg-secondary border-transparent focus:border-primary"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="h-10 px-3 flex items-center bg-secondary rounded-md text-sm text-muted-foreground truncate">
                        {timezone}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Timezone auto-detected from your browser
                  </p>
                </div>

                {/* Slippage Tolerance */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    Slippage Tolerance
                  </label>
                  <div className="flex gap-2 mb-2">
                    {slippagePresets.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => {
                          setSlippage(preset.toString());
                          setCustomSlippage(false);
                        }}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                          slippage === preset.toString() && !customSlippage
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground hover:bg-secondary/80'
                        )}
                      >
                        {preset}%
                      </button>
                    ))}
                    <button
                      onClick={() => setCustomSlippage(true)}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                        customSlippage
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      )}
                    >
                      Custom
                    </button>
                  </div>
                  {customSlippage && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={slippage}
                        onChange={(e) => setSlippage(e.target.value)}
                        className="w-24 text-center text-foreground bg-secondary border-transparent focus:border-primary"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Maximum price difference you're willing to accept. Default 0.5% works for most trades.
                  </p>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="p-4 bg-secondary/50 rounded-xl mb-6">
              <p className="text-sm text-center text-muted-foreground">
                You'll automatically invest <span className="font-semibold text-foreground">${numAmount}</span> into{' '}
                <span className="font-semibold text-foreground">{selectedAsset.symbol}</span>{' '}
                {getScheduleSummary()}
                {showAdvanced && (
                  <span className="block mt-1 text-xs">
                    Max slippage: {numSlippage}%
                  </span>
                )}
              </p>
            </div>

            <Button
              onClick={handleConfirm}
              disabled={numAmount <= 0 || isProcessing || (scheduleType === 'calendar' && selectedDays.length === 0)}
              className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isEditing ? (
                'Update DCA Plan'
              ) : (
                'Create DCA Plan'
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
