import { Card, CardBody, CardHeader, Heading, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';

interface PageSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function PageSection({ title, description, children }: PageSectionProps) {
  return (
    <Card variant="outline" bg="rgba(12, 20, 37, 0.8)">
      <CardHeader>
        <Stack spacing={2}>
          <Heading size="md">{title}</Heading>
          {description ? (
            <Text fontSize="sm" color="gray.400">
              {description}
            </Text>
          ) : null}
        </Stack>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}
