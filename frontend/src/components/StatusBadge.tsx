import { Badge } from '@chakra-ui/react';

interface StatusBadgeProps {
  status?: string;
}

const STATUS_COLOR: Record<string, string> = {
  collecting: 'yellow',
  live: 'orange',
  revealed: 'green',
  ready: 'green',
  pending: 'yellow',
  won: 'purple',
  free: 'gray',
  taken: 'yellow',
  pending_payment: 'orange',
  paid: 'green',
  failed: 'red'
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = (status ?? 'pending').toLowerCase();
  const color = STATUS_COLOR[normalized] ?? 'gray';
  const label = normalized.replace(/_/g, ' ');
  return (
    <Badge colorScheme={color} textTransform="capitalize" borderRadius="full" px={3} py={1}>
      {label}
    </Badge>
  );
}
