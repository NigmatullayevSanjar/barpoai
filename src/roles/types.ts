export type Role = 'super_admin' | 'platform_owner' | 'admin' | 'manager' | 'foreman' | 'accountant' | 'financier' | 'technician' | 'brigadier' | 'warehouse_manager';
export type RoleConfig = {label:string;description:string;sections:number[];write:number[]};
