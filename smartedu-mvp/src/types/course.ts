export interface CourseMetadata {
  subject: string;
  grade: number;
  topic: string;
  estimated_minutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface CourseSection {
  type: 'intro' | 'concept' | 'formula' | 'example' | 'calculator' | 'exercise' | 'summary';
  title: string;
  content: string;
}

export interface CourseContent {
  course_id: string;
  metadata: CourseMetadata;
  sections: CourseSection[];
  knowledge_tags: string[];
}

export interface CourseHtmlContent {
  course_id: string;
  html_content: string;
  metadata: {
    subject: string;
    grade: number;
    topic: string;
  };
}

export interface GenerateCourseRequest {
  user_question: string;
  subject: string;
  grade_level: number;
}

export interface GenerateCourseResponse {
  success: boolean;
  course_id?: string;
  course?: CourseContent;
  html_content?: string;
  error?: string;
  error_type?: string;
  validation_errors?: string[];
  generation_attempts?: number;
  generation_duration?: number;
}

export interface ParsedQuestion {
  subject: string;
  grade: number;
  topic: string;
  keywords: string[];
  intent: string;
}
