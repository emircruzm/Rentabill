TRUNCATE TABLE 
    public.simulation_items,
    public.purchase_items,
    public.sale_items,
    public.inventory_movements,
    public.purchases,
    public.simulations,
    public.sales,
    public.products,
    public.categories,
    public.suppliers,
    public.cash_registers,
    public.app_settings,
    public.team_invitations,
    public.user_preferences,
    public.store_members,
    public.profiles,
    public.stores
RESTART IDENTITY CASCADE;

DELETE FROM auth.users;
