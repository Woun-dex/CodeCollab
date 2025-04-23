// components/MonacoEditor.js
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false, // Disable server-side rendering
});


export default MonacoEditor;

