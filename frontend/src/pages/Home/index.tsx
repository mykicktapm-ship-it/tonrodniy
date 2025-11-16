import {
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  Progress,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Text,
} from '@chakra-ui/react';
import { PageSection } from '../../components/PageSection';
import { MOCK_ACTIVITY, MOCK_PLAYERS } from '../../lib/constants';
import { StatusBadge } from '../../components/StatusBadge';

export default function HomePage() {
  return (
    <Stack spacing={8}>
      <PageSection title="Next Honest Round" description="Preview of the next pulse lobby with mocked telemetry.">
        <Grid templateColumns={{ base: '1fr', md: '2fr 1fr' }} gap={6}>
          <GridItem>
            <Stack spacing={4}>
              <Text fontSize="sm" color="gray.400">
                Stake window open — waiting for wallets to commit mock TON.
              </Text>
              <Progress value={66} size="sm" colorScheme="purple" borderRadius="full" />
              <Stack spacing={3}>
                {MOCK_PLAYERS.map((player) => (
                  <HStack key={player.tonWallet} justify="space-between">
                    <Text fontFamily="mono" fontSize="sm">
                      {player.tonWallet}
                    </Text>
                    <StatusBadge status={player.status as any} />
                  </HStack>
                ))}
              </Stack>
              <Button alignSelf="flex-start">Reserve mock seat</Button>
            </Stack>
          </GridItem>
          <GridItem>
            <Stat>
              <StatLabel>Round hash</StatLabel>
              <StatNumber fontSize="lg" fontFamily="mono">
                0x9abf…92
              </StatNumber>
              <Text fontSize="sm" color="gray.400" mt={2}>
                Once live, the hash is locked and shared so everyone can verify fairness when we publish the reveal number.
              </Text>
            </Stat>
          </GridItem>
        </Grid>
      </PageSection>

      <PageSection title="Activity" description="Snapshot of lobby history pulled from mock data.">
        <Stack spacing={4}>
          {MOCK_ACTIVITY.map((event) => (
            <HStack key={event.id} justify="space-between">
              <Text>{event.action}</Text>
              <Text color="gray.500" fontSize="sm">
                {event.ts}
              </Text>
            </HStack>
          ))}
        </Stack>
      </PageSection>

      <PageSection title="Fairness protocol" description="States defined in plans.md">
        <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4}>
          {['Commit hash', 'Collect stakes', 'Reveal + mod winner'].map((step) => (
            <Box key={step} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontWeight="bold">{step}</Text>
              <Text fontSize="sm" color="gray.400" mt={2}>
                Mock description describing how the UI should explain this step during the real implementation.
              </Text>
            </Box>
          ))}
        </Grid>
      </PageSection>
    </Stack>
  );
}
