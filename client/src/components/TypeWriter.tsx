import { useState, useEffect } from 'react';

interface TypeWriterProps {
  text: string;
  speed?: number;
  delay?: number;
  onComplete?: () => void;
}

export function TypeWriter({ text, speed = 50, delay = 0, onComplete }: TypeWriterProps) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    // Wait for delay before starting
    const delayTimer = setTimeout(() => {
      setIsStarted(true);
    }, delay);

    return () => clearTimeout(delayTimer);
  }, [delay]);

  useEffect(() => {
    if (!isStarted) return;

    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timer);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, isStarted, onComplete]);

  return <span>{displayText}</span>;
}
