import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import Home from './page'

test('shows a URL box and a Check button', () => {
  render(<Home />)

  expect(screen.getByLabelText(/url/i).getAttribute('type')).toBe('url')
  expect(screen.getByRole('button', { name: 'Check' })).toBeTruthy()
})
