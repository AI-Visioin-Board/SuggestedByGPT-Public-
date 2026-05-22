import { Checkbox, FormControlLabel } from '@mui/material';
export { TOS_VERSION, PRIVACY_VERSION, TOS_CHECKBOX_TEXT } from '@shared/legal';

interface TosCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Optional sx overrides for the FormControlLabel */
  sx?: Record<string, unknown>;
}

export default function TosCheckbox({ checked, onChange, sx }: TosCheckboxProps) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          sx={{
            color: '#D97B6A',
            '&.Mui-checked': { color: '#D97B6A' },
          }}
        />
      }
      label={
        <span style={{ fontSize: '0.875rem' }}>
          I agree to the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'underline' }}
          >
            Terms of Service
          </a>
          {' '}and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'underline' }}
          >
            Privacy Policy
          </a>
          .
        </span>
      }
      sx={{ alignItems: 'flex-start', mt: 1, ...sx }}
    />
  );
}
