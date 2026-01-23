import * as XLSX from 'xlsx';
import { Gender } from '../types/enums';

export type VolunteerCreateItem = {
  username: string;
  password: string;
  realName: string;
  studentId: string;
  gender?: Gender;
  phone?: string;
};

export type ParsedVolunteersExcel = {
  totalRows: number;
  valid: Array<{ rowNumber: number; item: VolunteerCreateItem }>;
  invalid: Array<{ rowNumber: number; username: string; message: string }>;
};

type CanonicalField = 'username' | 'password' | 'realName' | 'studentId' | 'gender' | 'phone';

const HEADER_SYNONYMS: Record<CanonicalField, string[]> = {
  username: ['username', 'user name', '用户名', '账号', '登录名', '登录账号'],
  password: ['password', 'pwd', '密码', '初始密码'],
  realName: ['realname', 'real name', 'real_name', '姓名', '真实姓名'],
  studentId: ['studentid', 'student id', 'student_id', '学号'],
  gender: ['gender', 'sex', '性别'],
  phone: ['phone', 'mobile', '手机号', '联系电话', '联系方式'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '') // BOM
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function toStringCell(value: unknown): string {
  return String(value ?? '').trim();
}

function parseGender(value: unknown): Gender {
  const s = toStringCell(value).toLowerCase();
  if (!s) return Gender.UNKNOWN;

  if (['male', 'm', '男', 'man', '1'].includes(s)) return Gender.MALE;
  if (['female', 'f', '女', 'woman', '0', '2'].includes(s)) return Gender.FEMALE;
  if (['unknown', 'u', '未知', '不详'].includes(s)) return Gender.UNKNOWN;

  if (s === 'MALE'.toLowerCase()) return Gender.MALE;
  if (s === 'FEMALE'.toLowerCase()) return Gender.FEMALE;
  if (s === 'UNKNOWN'.toLowerCase()) return Gender.UNKNOWN;

  return Gender.UNKNOWN;
}

function pickColumnIndex(headerRow: unknown[], canonical: CanonicalField): number {
  const candidates = new Set(HEADER_SYNONYMS[canonical].map(normalizeHeader));

  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeHeader(headerRow[i]);
    if (candidates.has(key)) return i;
  }
  return -1;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-]+/g, '');
}

export function parseVolunteersExcel(buffer: Buffer): ParsedVolunteersExcel {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = wb.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error('Excel 文件为空（未找到工作表）');
  }

  const ws = wb.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('Excel 文件为空（未找到数据行）');
  }

  const headerRow = (matrix[0] ?? []) as unknown[];
  if (headerRow.length === 0) {
    throw new Error('Excel 模板表头为空');
  }

  const colIndex: Record<CanonicalField, number> = {
    username: pickColumnIndex(headerRow, 'username'),
    password: pickColumnIndex(headerRow, 'password'),
    realName: pickColumnIndex(headerRow, 'realName'),
    studentId: pickColumnIndex(headerRow, 'studentId'),
    gender: pickColumnIndex(headerRow, 'gender'),
    phone: pickColumnIndex(headerRow, 'phone'),
  };

  const required: CanonicalField[] = ['username', 'password', 'realName', 'studentId'];
  const missing = required.filter((k) => colIndex[k] < 0);
  if (missing.length > 0) {
    throw new Error(
      `Excel 模板缺少列：${missing.join(', ')}（支持中文列名：登录账号/初始密码/姓名/学号/性别/手机号）`
    );
  }

  const valid: Array<{ rowNumber: number; item: VolunteerCreateItem }> = [];
  const invalid: Array<{ rowNumber: number; username: string; message: string }> = [];

  let totalRows = 0;

  const seenUsernames = new Set<string>();
  const seenStudentIds = new Set<string>();

  for (let r = 1; r < matrix.length; r++) {
    const row = (matrix[r] ?? []) as unknown[];
    const rowNumber = r + 1; // 1-based excel row number

    const isEmpty = row.every((c) => toStringCell(c) === '');
    if (isEmpty) continue;

    totalRows += 1;

    const username = toStringCell(row[colIndex.username]);
    const password = toStringCell(row[colIndex.password]);
    const realName = toStringCell(row[colIndex.realName]);
    const studentId = toStringCell(row[colIndex.studentId]);
  	const gender = colIndex.gender >= 0 ? parseGender(row[colIndex.gender]) : Gender.UNKNOWN;
    const rawPhone = colIndex.phone >= 0 ? toStringCell(row[colIndex.phone]) : '';
    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    if (!username) {
      invalid.push({ rowNumber, username, message: 'username 不能为空' });
      continue;
    }
    if (seenUsernames.has(username)) {
      invalid.push({ rowNumber, username, message: 'username 在表格中重复' });
      continue;
    }
    if (!password || password.length < 6) {
      invalid.push({ rowNumber, username, message: 'password 不能为空且长度至少 6' });
      continue;
    }
    if (!realName) {
      invalid.push({ rowNumber, username, message: 'realName 不能为空' });
      continue;
    }
    if (!studentId) {
      invalid.push({ rowNumber, username, message: 'studentId（学号）不能为空' });
      continue;
    }
    if (seenStudentIds.has(studentId)) {
      invalid.push({ rowNumber, username, message: 'studentId（学号）在表格中重复' });
      continue;
    }
    if (phone && !/^\+?\d{6,20}$/.test(phone)) {
      invalid.push({ rowNumber, username, message: 'phone（手机号）格式不正确' });
      continue;
    }

    seenUsernames.add(username);
    seenStudentIds.add(studentId);

    valid.push({
      rowNumber,
      item: {
        username,
        password,
        realName,
        studentId,
        gender,
        phone,
      },
    });
  }

  return { totalRows, valid, invalid };
}
