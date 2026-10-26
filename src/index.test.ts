import assert from 'power-assert';

import * as index from './index';

describe('index', () => {
  it('exports the generatePdfPreview handler', () => {
    assert.equal(typeof index.generatePdfPreview, 'function');
  });

  it('exports the generateThumbnails handler', () => {
    assert.equal(typeof index.generateThumbnails, 'function');
  });
});
