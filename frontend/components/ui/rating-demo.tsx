'use client';

import { useState } from 'react';
import { Rating } from '@/components/ui/rating';

export default function RatingDefaultDemo() {
  const [value, setValue] = useState(3);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 p-12">
      <h3 className="text-sm font-medium text-muted-foreground">Rate this component</h3>
      <Rating value={value} onValueChange={setValue} />
    </div>
  );
}
