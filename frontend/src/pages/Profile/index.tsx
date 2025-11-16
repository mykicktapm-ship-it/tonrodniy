import { Avatar, Button, HStack, Stack, Text } from '@chakra-ui/react';
import { PageSection } from '../../components/PageSection';

export default function ProfilePage() {
  return (
    <Stack spacing={8}>
      <PageSection title="Wallet connect" description="Mock view for TON Connect integration">
        <Stack spacing={4}>
          <HStack>
            <Avatar name="UQC3" size="lg" bg="brand.500" color="white" />
            <Stack spacing={1}>
              <Text fontWeight="bold">UQC3…mock</Text>
              <Text fontSize="sm" color="gray.400">
                Status: disconnected
              </Text>
            </Stack>
          </HStack>
          <Button w={{ base: 'full', sm: 'auto' }}>Connect wallet</Button>
        </Stack>
      </PageSection>

      <PageSection title="Logs" description="Audit entries will be listed here">
        <Stack spacing={3}>
          {['Seat reserved', 'Stake confirmed', 'Withdrawal simulated'].map((entry, index) => (
            <Text key={entry} color="gray.400">
              {index + 1}. {entry}
            </Text>
          ))}
        </Stack>
      </PageSection>
    </Stack>
  );
}
