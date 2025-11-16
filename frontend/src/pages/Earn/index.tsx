import { Box, Button, Grid, Skeleton, Stack, Text } from '@chakra-ui/react';
import { PageSection } from '../../components/PageSection';
import { useConnectedUser } from '../../hooks/useConnectedUser';
import { useUserLogs } from '../../hooks/useUserLogs';
import { useWalletStore } from '../../stores/walletStore';

const formatTon = (value: number) => `${value.toFixed(2)} TON`;

export default function EarnPage() {
  const { data: user } = useConnectedUser();
  const { data: logs, isLoading: areLogsLoading } = useUserLogs(user?.id);
  const { connect, status: walletStatus } = useWalletStore((state) => ({
    connect: state.connect,
    status: state.status
  }));

  const totalTon = logs?.reduce((sum, log) => sum + (log.amountTon ?? 0), 0) ?? 0;
  const recentLogs = logs?.slice(0, 3) ?? [];

  return (
    <Stack spacing={8}>
      <PageSection
        title="Earn"
        description="Reward pools are mapped to verifiable activity. Connect your wallet to see logged rewards."
      >
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={6}>
          <Stack spacing={4}>
            <Text color="gray.400">
              Every reservation, stake, and payout is logged with a TON hash. Once liquidity mining rules are finalized these
              entries will determine payouts automatically.
            </Text>
            <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontSize="sm" color="gray.400">
                Logged TON volume
              </Text>
              <Text fontSize="3xl" fontWeight="bold">
                {formatTon(totalTon)}
              </Text>
            </Box>
            <Button onClick={connect} isLoading={walletStatus === 'connecting'}>
              {user ? 'Generate invite link' : 'Connect wallet to track rewards'}
            </Button>
          </Stack>
          <Stack spacing={4}>
            {areLogsLoading ? (
              <Skeleton height="140px" />
            ) : recentLogs.length ? (
              recentLogs.map((entry) => (
                <Box key={entry.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
                  <Text fontFamily="mono" fontSize="sm">
                    {entry.txHash ?? entry.action}
                  </Text>
                  <Text fontSize="sm" color="gray.400">
                    {entry.action} · {entry.status ?? 'pending'}
                  </Text>
                  {entry.amountTon != null && (
                    <Text fontSize="sm" color="gray.300">
                      {formatTon(entry.amountTon)}
                    </Text>
                  )}
                </Box>
              ))
            ) : (
              <Text color="gray.500">No activity yet. Reserve a seat to start accumulating logs.</Text>
            )}
          </Stack>
        </Grid>
      </PageSection>

      <PageSection title="Future pools">
        <Stack spacing={3}>
          {['Validator boost', 'Community QA', 'Pulse educators'].map((pool) => (
            <Box key={pool} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontWeight="bold">{pool}</Text>
              <Text fontSize="sm" color="gray.400">
                Pool mechanics will activate once live TON volume crosses the next milestone.
              </Text>
            </Box>
          ))}
        </Stack>
      </PageSection>
    </Stack>
  );
}
