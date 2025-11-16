import { Box, Button, Grid, Stack, Text } from '@chakra-ui/react';
import { PageSection } from '../../components/PageSection';

const mockReferrals = [
  { id: 1, wallet: 'UQCX…1f2', rounds: 3, reward: 2.3 },
  { id: 2, wallet: 'UQAK…bb1', rounds: 1, reward: 0.4 },
];

export default function EarnPage() {
  return (
    <Stack spacing={8}>
      <PageSection title="Earn" description="Placeholder for liquidity mining and referrals.">
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={6}>
          <Stack spacing={4}>
            <Text color="gray.400">
              Plans.md defines reward pools tied to honest activity. This mock shows the copy and CTA placement without
              any backend yet.
            </Text>
            <Button alignSelf="flex-start">Generate invite link</Button>
          </Stack>
          <Stack spacing={4}>
            {mockReferrals.map((entry) => (
              <Box key={entry.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
                <Text fontFamily="mono" fontSize="sm">
                  {entry.wallet}
                </Text>
                <Text fontSize="sm" color="gray.400">
                  {entry.rounds} rounds · {entry.reward} TON projected
                </Text>
              </Box>
            ))}
          </Stack>
        </Grid>
      </PageSection>

      <PageSection title="Future pools">
        <Stack spacing={3}>
          {['Validator boost', 'Community QA', 'Pulse educators'].map((pool) => (
            <Box key={pool} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontWeight="bold">{pool}</Text>
              <Text fontSize="sm" color="gray.400">
                Placeholder copy to remind us to design the actual formula later.
              </Text>
            </Box>
          ))}
        </Stack>
      </PageSection>
    </Stack>
  );
}
