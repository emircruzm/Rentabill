import { 
  Product, 
  Supplier, 
  SaleRecord, 
  InventoryMovement, 
  PastSimulation, 
  TeamInvitation, 
  RegisteredDirectoryUser 
} from '../types';

export const INITIAL_PRODUCTS: Product[] = [];
export const INITIAL_SUPPLIERS: Supplier[] = [];
export const INITIAL_SALES: SaleRecord[] = [];
export const INITIAL_MOVEMENTS: InventoryMovement[] = [];
export const INITIAL_PAST_SIMULATIONS: PastSimulation[] = [];
export const REGISTERED_USERS_DIRECTORY: RegisteredDirectoryUser[] = [];
export const INITIAL_INVITATIONS: TeamInvitation[] = [];

export const ROLE_INFO = {
  CAJERO: {
    name: 'Cajero',
    badge: 'Cobros',
    description: 'Solo puede usar la pantalla de Vender, para cobrarle a los clientes. No puede ver el dinero total del negocio, ni cambiar precios, ni invitar a nadie más.'
  },
  REPOSITOR: {
    name: 'Repositor',
    badge: 'Almacén',
    description: 'Solo puede entrar a Inventario, para agregar productos nuevos y decir cuántos quedan de cada uno. No puede ver cuánto gana el negocio, ni entrar a Ajustes.'
  },
  ADMIN: {
    name: 'Administrador (Dueño o Encargado)',
    badge: 'Total',
    description: 'Puede entrar a todo: ver cuánto gana el negocio, cobrar, manejar el inventario, hacer simulaciones y cambiar los ajustes. También es el único que puede invitar o sacar personas del equipo.'
  }
} as const;
