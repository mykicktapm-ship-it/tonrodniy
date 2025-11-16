import { Badge } from '@chakra-ui/react';

interface StatusBadgeProps {
  status: 'collecting' | 'live' | 'revealed' | 'ready' | 'pending' | 'won';
}

const STATUS_COLOR: Record<StatusBadgeProps['status'], string> = {
  collecting: 'yellow',
  live: 'orange',
  revealed: 'green',
  ready: 'green',
  pending: 'yellow',
  won: 'purple',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge colorScheme={STATUS_COLOR[status]} textTransform="capitalize" borderRadius="full" px={3} py={1}>
      {status}
    </Badge>
  );
}
